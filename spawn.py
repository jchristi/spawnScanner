#!/usr/bin/env python2
import json
import math
import logging
import time
# import geojson

import threading
import utils

from pgoapi import pgoapi
from pgoapi import utilities as util
from pgoapi.exceptions import (NotLoggedInException,
                               ServerSideRequestThrottlingException,
                               ServerSideAccessForbiddenException)
# from pgoapi.exceptions import ServerBusyOrOfflineException

from s2sphere import CellId, LatLng

from json_to_geojson import convert_to_geojson


spawn_points = set()
spawn_encounters = set()
stops = set()
gyms = set()
skipped = set()

scans = []
num2words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']
MAX_RETRIES = 3

with open('config.json') as file:
    config = json.load(file)


def doScanp(wid, sLat, sLng, api):
    for i in range(0, MAX_RETRIES):
        try:
            doScan(wid, sLat, sLng, api)
        except (KeyError, TypeError), e:
            print('worker {} scan of ({}, {}) returned error, retry {}/{}').format(
                    wid, sLat, sLng, i, MAX_RETRIES)
            time.sleep(config['scanDelay'])
            continue
        else:
            break


def doScan(wid, sLat, sLng, api):
    print ('worker {} is scanning ({}, {})'.format(wid, sLat, sLng))
    api.set_position(sLat, sLng, 89.24517822265625)
    cell_ids = util.get_cell_ids(lat=sLat, long=sLng, radius=80)
    timestamps = [0,] * len(cell_ids)
    while True:
        try:
            response_dict = api.get_map_objects(latitude = sLat,
                longitude = sLng,
                since_timestamp_ms = timestamps,
                cell_id = cell_ids)
        except ServerSideRequestThrottlingException:
            config['scanDelay'] += 0.5
            print ('Request throttled, increasing sleep by 0.5 to {}').format(config['scanDelay'])
            time.sleep(config['scanDelay'])
            continue
        except:
            time.sleep(config['scanDelay'])
            api.set_position(sLat, sLng, 89.24517822265625) # altitude used to be zero
            time.sleep(config['scanDelay'])
            continue
        break

    try:
        cells = response_dict['responses']['GET_MAP_OBJECTS']['map_cells']
    except TypeError:
        print ('thread {} error getting map data for {}, {}'.format(wid,sLat, sLng))
        raise
    except KeyError:
        print ('thread {} error getting map data for {}, {}'.format(wid,sLat, sLng))
        raise
        return
    for cell in cells:
        curTime = cell['current_timestamp_ms']
        for wild in cell.get('wild_pokemons', []):
            if wild['time_till_hidden_ms'] > 0:
                timeSpawn = (curTime + (wild['time_till_hidden_ms'])) - 900000
                gmSpawn = time.gmtime(int(timeSpawn / 1000))
                secSpawn = (gmSpawn.tm_min * 60) + (gmSpawn.tm_sec)
                sid = wild['spawn_point_id']
                lat = wild['latitude']
                lng = wild['longitude']
                pid = wild['pokemon_data']['pokemon_id']
                lat_lng = LatLng.from_degrees(lat, lng)
                cell_id = CellId.from_lat_lng(lat_lng).to_token()
                spawn_point = SpawnPoint(time=secSpawn, sid=sid, lat=lat, lng=lng, cell=cell_id)
                spawn_encounter = SpawnEncounter(time=timeSpawn, sid=sid, lat=lat, lng=lng,
                    cell=cell_id, pid=pid)
                spawn_points.add(spawn_point)
                spawn_encounters.add(spawn_encounter)
        for fort in cell.get('forts', []):
            if not fort['enabled']:
                continue
            id = fort['id']
            lat = fort['latitude']
            lng = fort['longitude']
            if 'type' in fort:
                # got a pokestop
                lure = fort.get('lure_info', {}).get('lure_expires_timestamp_ms', -1)
                stops.add(PokeStop(id=id, lat=lat, lng=lng, lure=lure))
            if 'gym_points' in fort:
                # got a gym
                team = fort.get('owned_by_team', 0)
                gyms.add(Gym(id=id, lat=lat, lng=lng, team=team))
    time.sleep(config['scanDelay'])


def genwork():
    totalwork = 0
    for rect in config['work']:
        # delta latitude?
        dlat = 0.00089
        # delta longitude? (delta lat / cos(radians/2)
        dlng = dlat / math.cos(math.radians((rect[0] + rect[2]) * 0.5))
        startLat = min(rect[0], rect[2]) + (0.624 * dlat) # min(lat) + 2*pi*dlat (radius?)
        startLng = min(rect[1], rect[3]) + (0.624 * dlng) # min(lng) + 2*pi*dlng (radius?)
        # wtf???
        latSteps = int((((max(rect[0], rect[2]) - min(rect[0], rect[2]))) / dlat) + 0.75199999)
        if latSteps < 1:
            latSteps = 1
        # wtf???
        lngSteps = int((((max(rect[1], rect[3]) - min(rect[1], rect[3]))) / dlng) + 0.75199999)
        if lngSteps < 1:
            lngSteps = 1
        for i in range(latSteps):
            if (i % 2) == 0:
                for j in range(0, lngSteps, 1):
                    # { x: startLat + dlat*latSteps, y: startLng + dlat*lngSteps }
                    scans.append([startLat + (dlat * i), startLng + (dlng * j)])
            else:
                for j in range(lngSteps - 1, -1, -1):
                    # { x: startLat + dlat*latSteps, y: startLng + dlat*lngSteps }
                    scans.append([startLat + (dlat * i), startLng + (dlng * j)])
        totalwork += latSteps * lngSteps
    return totalwork


def worker(wid, Wstart):
    workStart = min(Wstart, len(scans) - 1)
    workStop = min(Wstart+config['stepsPerPassPerWorker'], len(scans) - 1)
    if workStart == workStop:
        return
    print 'worker {} is doing steps {} to {}'.format(wid, workStart, workStop)
    api = login(wid)
    for j in range(5):
        startTime = time.time()
        print 'worker {} is doing {} pass'.format(wid, num2words[j])
        for i in xrange(workStart, workStop):
            doScanp(wid, scans[i][0], scans[i][1], api)
        curTime = time.time()
        runTime = curTime - startTime
        sleepTime = 600 - runTime
        message = 'worker {} took {} seconds to do {} pass'.format(wid, runTime, num2words[j])
        if j == 5:
            print '{} ending thread'.format(message)
        elif sleepTime > 0:
            api = login(wid)
            print '{}, now sleeping for {}'.format(message, sleepTime)
            time.sleep(sleepTime)
        else:
            api = login(wid)
            print '{} so not sleeping'.format(message)


def login(wid, provider=None, username=None, password=None, position_lat=0,
          position_lng=0, position_alt=0, proxy_config=None):
    login_retries = 0
    logged_in = False
    provider = provider or config['auth_service']
    username = username or config['users'][wid]['username']
    password = password or config['users'][wid]['password']
    proxy_config = proxy_config or config.get('proxy_config', None)
    while not logged_in:
        # make gmaps api call for altitude
        api = pgoapi.PGoApi(provider=provider,
                            username=username,
                            password=password,
                            position_lat=position_lat,
                            position_lng=position_lng,
                            position_alt=position_alt,
                            proxy_config=proxy_config)
        api.activate_signature(utils.get_encryption_lib_path())
        try:
            api.get_player()
            time.sleep(2)
            logged_in = True
        except (NotLoggedInException, ServerSideRequestThrottlingException):
            login_retries += 1
            if login_retries > MAX_RETRIES:
                raise
            print('thread {} Login Error, retry {}/{}').format(wid, login_retries, MAX_RETRIES)
            time.sleep(2)
        except ServerSideAccessForbiddenException:
            print('thread {} Server refused connection, IP might be blocked').format(wid)
    return api


class HashableDict(dict):
    def __eq__(x, y):
        return x.id == y.id
    def __hash__(self):
        return hash(self.id)


class GeoItem(HashableDict):
    def __init__(self, lat, lng):
        self['lat'] = lat
        self['lng'] = lng
        self.id = (lat, lng)
    @classmethod
    def load(cls, f):
        try:
          return set([ cls(**x) for x in json.load(f) ])
        except ValueError:
          print 'Warning: could not json decode {}. Evaluating as empty...'.format(f.name)
          return set()
    @classmethod
    def dump(cls, items, filename, merge=False):
        # TODO: attempt to convert items to set if it isnt already and fail if fail
        if merge:
            with open(filename, 'r') as f:
                items = items | cls.load(f)
        with open(filename, 'w') as f:
            json.dump(list(items), f)


class Gym(GeoItem):
    def __init__(self, lat, lng, id, team):
        super(Gym, self).__init__(lat, lng)
        self['team'] = team
        self['id'] = id
        self.id = id


class PokeStop(GeoItem):
    def __init__(self, lat, lng, lure, id):
        super(PokeStop, self).__init__(lat, lng)
        self['lure'] = lure
        self['id'] = id
        self.id = id


class SpawnPoint(GeoItem):
    def __init__(self, cell, lat, lng, time, sid):
        super(SpawnPoint, self).__init__(lat, lng)
        self['cell'] = cell
        self['time'] = time
        self['sid'] = sid
        self.id = '{},{}'.format(time, sid)


class SpawnEncounter(SpawnPoint):
    def __init__(self, time, pid, cell, lat, lng, sid):
        super(SpawnEncounter, self).__init__(cell, lat, lng, time, sid)
        self['pid'] = pid
        self.id = '{},{}'.format(self.id, pid)


def data_to_list(data):
    if isinstance(data, list):
      return data
    out = []
    for item in data.values():
        out.append(item)
    return out


def dump_to_file(data, outfile, merge=False):
    out = data_to_list(data)
    with open(outfile, 'r+') as f:
        olddata = json.load(f)
        json.dump(out, f)


def main():
    tscans = genwork()
    print 'total of {} steps'.format(tscans)
    numWorkers = ((tscans - 1) // config['stepsPerPassPerWorker']) + 1
    if numWorkers > len(config['users']):
        numWorkers = len(config['users'])
    numScans = config['stepsPerPassPerWorker']
    numHours = int(math.ceil(float(tscans) / (numWorkers * config['stepsPerPassPerWorker'])))
    print 'with {} worker(s), doing {} scans each, would take {} hour(s)'.format(
            numWorkers, numScans, numHours)

    if (config['stepsPerPassPerWorker'] * config['scanDelay']) > 600:
        print 'error. scan will take more than 10mins so all 6 scans will take more than 1 hour'
        print 'please try using less scans per worker'
        return

    #heres the logging setup
    # log settings
    # log format
    logging.basicConfig(level=logging.DEBUG,
        format='%(asctime)s [%(module)10s] [%(levelname)5s] %(message)s')
    # log level for http request class
    logging.getLogger("requests").setLevel(logging.WARNING)
    # log level for main pgoapi class
    logging.getLogger("pgoapi").setLevel(logging.WARNING)
    # log level for internal pgoapi class
    logging.getLogger("rpc_api").setLevel(logging.WARNING)

    if config['auth_service'] not in ['ptc', 'google']:
        log.error("Invalid Auth service specified! ('ptc' or 'google')")
        return None

    threads = []
    scansStarted = 0
    for i in xrange(len(config['users'])):
        if scansStarted >= len(scans):
            break;
        time.sleep(5)
        t = threading.Thread(target=worker, args = (i, scansStarted))
        t.start()
        threads.append(t)
        scansStarted += config['stepsPerPassPerWorker']
    while scansStarted < len(scans):
        time.sleep(15)
        for i in xrange(len(threads)):
            if not threads[i].isAlive():
                threads[i] = threading.Thread(target=worker, args = (i, scansStarted))
                threads[i].start()
                scansStarted += config['stepsPerPassPerWorker']
    for t in threads:
        t.join()
    print 'all done. saving data'

    # TODO: Handle errors

    SpawnEncounter.dump(spawn_encounters, 'pokes.json', merge=True)
    SpawnPoint.dump(spawn_points, 'spawns.json', merge=True)
    PokeStop.dump(stops, 'stops.json', merge=True)
    Gym.dump(gyms, 'gyms.json', merge=True)
    #dump_to_file(config['work'], 'scanned.json')

    #output GeoJSON data
    convert_to_geojson('gyms.json', 'geo_gyms.json')
    convert_to_geojson('stops.json', 'geo_stops.json')


if __name__ == '__main__':
    main()
