var gym;
var stop;
var gymsLayer;
var stopsLayer;
var map;
var spawns = [];
var green;
var blue;
var orange;
var grey;

var show1 = true;
var show2 = true;
var show3 = true;
var show4 = true;

var GREEN  = '#00ff00';
var ORANGE = '#ff7e00';
var BLUE   = '#00fcff';
var GREY   = '#858484';

var spawn_shape = 'marker';

function getFile(path, asynch, callback) {
  var xhr = new XMLHttpRequest();
  xhr.overrideMimeType("application/json");
  xhr.open("GET", path, asynch);
  xhr.onload = function (e) {
    if (xhr.readyState === 4) {
      callback(xhr.responseText);
    }
  };
  xhr.onerror = function (e) {
    console.error(xhr.status);
  };
  xhr.send(null);
}

function redrawSpawn(p, force) {
  var D = new Date();
  // seconds past the hour
  var secPastH = (60 * D.getUTCMinutes()) + D.getUTCSeconds();
  // number of seconds that have passed since last spawn started
  var timeD = ((secPastH - p.time) + 3600) % 3600;
  // number of seconds until the next event
  var numSecsUntilNextEvent;
  if (timeD < 600) {
    numSecsUntilNextEvent = 600 - timeD;
    if (p.mode != 1 || force) {
      if (spawn_shape === 'marker') {
        p.marker.setIcon(green);
      } else {
        p.marker.setOptions({ fillColor: GREEN });
      }
      p.marker.setMap(show1 ? map : null);
    }
  } else if(timeD < 900) {
    numSecsUntilNextEvent = 900 - timeD;
    if (p.mode != 2 || force) {
      if (spawn_shape === 'marker') {
        p.marker.setIcon(orange);
      } else {
        p.marker.setOptions({ fillColor: ORANGE });
      }
      p.marker.setMap(show2 ? map : null);
    }
  } else if(timeD < 3300) {
    numSecsUntilNextEvent = 3300 - timeD;
    if (p.mode != 4 || force) {
      if (spawn_shape === 'marker') {
        p.marker.setIcon(grey);
      } else {
        p.marker.setOptions({ fillColor: GREY });
      }
      p.marker.setMap(show4 ? map : null);
    }
  } else {
    numSecsUntilNextEvent = 3600 - timeD;
    if (p.mode != 3 || force) {
      if (spawn_shape === 'marker') {
        p.marker.setIcon(blue);
      } else {
        p.marker.setOptions({ fillColor: BLUE });
      }
      p.marker.setMap(show3 ? map : null);
    }
  }
  setTimeout(function(){
    redrawSpawn(p, false)
  }, numSecsUntilNextEvent * 1000);
}

function redrawSpawns(force) {
  async.each(spawns, function(p, callback){
    redrawSpawn(p, force);
    async.setImmediate(function() {
      callback();
    });
  });
}

function toggleType(elm, event, type) {
  if(type == 'gyms') {
    gymsLayer.setMap( elm.checked ? map : null);
  } else if (type == 'pokestops') {
    stopsLayer.setMap( elm.checked ? map : null);
  } else if (type == 'active') {
    show1 = elm.checked ? true : false;
    redrawSpawns(true);
  } else if (type == 'despawning') {
    show2 = elm.checked ? true : false;
    redrawSpawns(true);
  } else if (type == 'spawning') {
    show3 = elm.checked ? true : false;
    redrawSpawns(true);
  } else if (type == 'inactive') {
    show4 = elm.checked ? true: false;
    redrawSpawns(true);
  }
}

function getSpawnIcon(url) {
  return {
    url: url,
    size: new google.maps.Size(20, 20),
    anchor: new google.maps.Point(10, 10),
    scaledSize: new google.maps.Size(15, 15)
  };
}

function getSpawnCircle(fillColor) {
  return {
    scale: 5,
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: fillColor,
    fillOpacity: 0.5,
    strokeWeight: 0
  };
}

function initMap() {
  if (spawn_shape === 'marker') {
    green = getSpawnIcon("./static/green.png");
    blue = getSpawnIcon("./static/blue.png");
    orange = getSpawnIcon("./static/orange.png");
    grey = getSpawnIcon("./static/grey.png");
  } else {
    green = getSpawnCircle(GREEN);
    orange = getSpawnCircle(ORANGE);
    blue = getSpawnCircle(BLUE);
    grey = getSpawnCircle(GREY);
  }
  gym = {
    url: "./static/gym.png",
    size: new google.maps.Size(30, 30),
    anchor: new google.maps.Point(15,30)
  };
  stop = {
    url: "./static/pokestop.png",
    size: new google.maps.Size(30, 30),
    anchor: new google.maps.Point(15, 30)
  };
  infowindow = new google.maps.InfoWindow();

  var mapDiv = document.getElementById('map');
  map = new google.maps.Map(mapDiv, {
    center: { lat: 38.89772142022343, lng: -77.03654050827026},
    zoom: 15,
    clickableIcons: false,
    streetViewControl: false,
    styles: [
      {
        "featureType": "administrative",
        "stylers": [
          { "visibility": "off" }
        ]
      },
      /*{
        "featureType": "road",
        "stylers": [
          { "visibility": "off" }
        ]
      },*/
      {
        "featureType": "transit",
        "stylers": [
          { "visibility": "off" }
        ]
      },
      {
        "featureType": "poi.business",
        "stylers": [
          { "visibility": "off" }
        ]
      },
      /*{
        "featureType": "poi",
        "stylers": [
          { "visibility": "off" }
        ]
      },*/
      {
        "featureType": "poi.park",
        "stylers": [
          { "visibility": "on" }
        ]
      }
    ]
  });

  google.maps.event.addListener(map, "rightclick", function(event){
    showContextMenu(event.latLng);
  });
  google.maps.event.addListener(map, "click", function(event){
    hideContextMenu();
  });

  getFile('./spawns.json', true, function(response) {
    //console.log('got spawns');
    var data = JSON.parse(response);
    console.log(data.length + ' spawn points loaded');
    async.each(data, function(p, callback) {
      var spawntime = "Spawns every " + Math.floor(p.time / 60) + " minutes past the hour";
      // + ":" + (p.time - (Math.floor(p.time / 60) * 60));
      if (spawn_shape === 'marker') {
        p.marker = new google.maps.Marker({
          position: { lat: p.lat, lng: p.lng },
          icon: grey,
          map: map,
          title: spawntime,
          opacity: 0.75
        });
      } else {
        p.marker = new google.maps.Circle({
          center: new google.maps.LatLng(p.lat, p.lng),
          radius: 7,
          map: map,
          fillOpacity: 0.5, /*0.05,*/
          fillColor: GREY,
          strokeWeight: 0
        });
      }
      p.mode = 0;
      spawns.push(p);
      redrawSpawn(p, true);
      async.setImmediate(function() {
        callback();
      });
    });
  });

  /*
  getFile('./scanned_points.json', true, function(response) {
    //console.log('got scanned points');
    var data = JSON.parse(response);
    console.log(data.length + ' scan points loaded');
    async.each(data, function(p, callback) {
      var circle = new google.maps.Circle({
        center: { lat: p[0], lng: p[1] },
        radius: 70,
        map: map,
        fillOpacity: 0.05,
        fillColor: '#000',
        strokeWeight: 0
      });
      async.setImmediate(function() {
        callback();
      });
    });
  });
  */

  getFile('./scanned.json', true, function(response) {
    //console.log('got previous scans');
    var data = JSON.parse(response);
    async.each(data, function(p, callback) {
      var rectangle = new google.maps.Rectangle({
        strokeColor: '#FF0000',
        strokeOpacity: 0.3,
        strokeWeight: 0,
        fillColor: '#FF0000',
        fillOpacity: 0.09,
        map: map,
        bounds: {
          north: p[0],
          south: p[2],
          east: p[3],
          west: p[1]
        }
      });
      async.setImmediate(function() {
        callback();
      });
    });
  });

  gymsLayer = new google.maps.Data();
  stopsLayer = new google.maps.Data();

  gymsLayer.loadGeoJson('./geo_gyms.json');
  gymsLayer.setStyle(function(feature) {
    return {icon: gym};
  });
  //gymsLayer.setMap(map);
  gymsLayer.addListener('click', function(event) {
    infowindow.setContent(event.feature.getProperty('name'));
    infowindow.setPosition(event.latLng);
    infowindow.setOptions({pixelOffset: new google.maps.Size(0,-34)});
    infowindow.open(map);
  });

  stopsLayer.loadGeoJson('./geo_stops.json');
  stopsLayer.setStyle(function(feature) {
    return {icon: stop};
  });
  //stopsLayer.setMap(map);
  stopsLayer.addListener('click', function(event) {
    infowindow.setContent(event.feature.getProperty('name'));
    infowindow.setPosition(event.latLng);
    infowindow.setOptions({pixelOffset: new google.maps.Size(0,-34)});
    infowindow.open(map);
  });

  var legenditems = {
    gyms: {
      name: 'Gyms',
      icon: './static/gym.png',
      layer: 'gymsLayer'
    },
    pokestops: {
      name: 'Pokestops',
      icon: './static/pokestop.png',
      layer: 'stopsLayer'
    },
    active: {
      name: 'Spawned recently',
      icon: './static/green.png'
    },
    despawning: {
      name: 'Despawning soon',
      icon: './static/orange.png'
    },
    spawning: {
      name: 'Spawning soon',
      icon: './static/blue.png'
    },
    inactive: {
      name: 'Inactive',
      icon: './static/grey.png'
    }
  };

  var legend = document.getElementById('legend');
  for (var key in legenditems) {
    var type = legenditems[key];
    var name = type.name;
    var icon = type.icon;
    var layer = type.layer;
    var checked = (key !== 'pokestops' && key !== 'gyms') ? 'checked ' : '';
    var div = document.createElement('div');
    div.innerHTML = '<input ' + checked + 'type="checkbox" onchange="toggleType(this, event, \'' + key + '\')">' + name + '<img src="' + icon + '">';
    legend.appendChild(div);
  }

  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(legend);
  google.maps.event.addListener(map, 'click', function() { infowindow.close(); });
  // WorkerLocationGenerator
  google.maps.event.addListener(map, "click", function(event){ hideContextMenu(); });
  google.maps.event.addListener(map, "rightclick", function(event){
    showContextMenu(event.latLng);
  });
}
