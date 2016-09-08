var locations = [];
var rectangles = [];
var currentId;

function getCanvasXY(currentLatLng){
  var scale = Math.pow(2, map.getZoom());
  var nw = new google.maps.LatLng(
    map.getBounds().getNorthEast().lat(),
    map.getBounds().getSouthWest().lng()
  );
  var worldCoordinateNW = map.getProjection().fromLatLngToPoint(nw);
  var worldCoordinate = map.getProjection().fromLatLngToPoint(currentLatLng);
  var currentLatLngOffset = new google.maps.Point(
    Math.floor((worldCoordinate.x - worldCoordinateNW.x) * scale),
    Math.floor((worldCoordinate.y - worldCoordinateNW.y) * scale)
  );
  return currentLatLngOffset;
}

function setMenuXY(currentLatLng){
  var mapWidth = $('#map_canvas').width();
  var mapHeight = $('#map_canvas').height();
  var menuWidth = $('.cmenu').width();
  var menuHeight = $('.cmenu').height();
  var clickedPosition = getCanvasXY(currentLatLng);
  var x = clickedPosition.x ;
  var y = clickedPosition.y ;

  if((mapWidth - x ) < menuWidth)
    x = x - menuWidth;
  if((mapHeight - y ) < menuHeight)
    y = y - menuHeight;

  $('.cmenu').css('left',x);
  $('.cmenu').css('top',y);
};

function showContextMenu(currentLatLng) {
  var projection;
  var contextmenuDir;
  projection = map.getProjection() ;
  $('.cmenu').remove();
  contextmenuDir = document.createElement("div");
  contextmenuDir.className  = 'cmenu';
  contextmenuDir.innerHTML = '<div class="item" title="Add another location to check" '
      + 'onclick="addNewArea' + currentLatLng + ';"><div class="label">Add Area</div></div>'
    + '<div class="item ' + (locations.length > 0 ? '' : 'disabled')
      + '" title="Copy locations list to clipboard" ' + (locations.length > 0 ?
                                                         'onclick="copyWorkerLocations()"' : '')
      + '><div class="label">Copy Marker Locations</div></div>'
    + '<div class="item ' + (locations.length > 0 ? '' : 'disabled')
      + '" title="Export Spawn Points" ' + (locations.length > 0 ?
                                                         'onclick="copySpawnPoints()"' : '')
      + '><div class="label">Export Spawn Points</div></div>'
    + '<div class="item ' + (locations.length > 0 ? '' : 'disabled')
      + '" title="Clear all areas from the map" ' + (locations.length > 0 ?
                                                     'onclick="clearAllAreas()"' : '')
      + '><div class="label">Clear All Areas</div></div>';
  $(map.getDiv()).append(contextmenuDir);
  setMenuXY(currentLatLng);
  contextmenuDir.style.visibility = "visible";
}

function showContextMenu2(currentLatLng,currentId) {
  var projection;
  var contextmenuDir;
  projection = map.getProjection() ;
  $('.cmenu').remove();
  contextmenuDir = document.createElement("div");
  contextmenuDir.className  = 'cmenu';
  contextmenuDir.innerHTML = '<div class="item" title="Remove selected Area" onclick="removeArea('
      + currentId + ');"><div class="label">Remove Area</div></div>'
    + '<div class="item ' + (locations.length > 0 ? '' : 'disabled')
      + '" title="Copy locations list to clipboard" '
      + (locations.length > 0 ? 'onclick="copyWorkerLocations()"' : '') + '>'
      + '<div class="label">Copy Marker Locations</div></div>'
    + '<div class="item ' + (locations.length > 0 ? '' : 'disabled')
      + '" title="Export Spawn Points" '
      + (locations.length > 0 ? 'onclick="copySpawnPoints()"' : '') + '>'
      + '<div class="label">Export Spawn Points</div></div>'
    + '<div class="item ' + (locations.length > 0 ? '' : 'disabled')
      + '" title="Clear all areas from the map" ' + (locations.length > 0
      ? 'onclick="clearAllAreas()"' : '') + '><div class="label">Clear All Areas</div></div>';
  $(map.getDiv()).append(contextmenuDir);
  setMenuXY(currentLatLng);
  contextmenuDir.style.visibility = "visible";
}

function hideContextMenu() {
  $('.cmenu').remove();
  $("#LocationsJSON").fadeOut(200);
}

function addNewArea(Lat,Lng) {
  var rectangle = new google.maps.Rectangle({
    bounds: {
      north: Lat,
      south: Lat - 0.008,
      east: Lng + 0.01,
      west: Lng
    },
    map: map,
    editable: true
  });
  rectangles.push(rectangle);
  locations.push('\n['+rectangle.getBounds().getNorthEast().lat()+', '+rectangle.getBounds().getSouthWest().lng()+', '+rectangle.getBounds().getSouthWest().lat()+', '+rectangle.getBounds().getNorthEast().lng()+']');
  hideContextMenu();
  rectangle.addListener('rightclick',function(event,rectangle) {
    currentId = rectangles.indexOf(this);
    showContextMenu2(event.latLng,currentId);
  });
  rectangle.addListener('bounds_changed', function(rectangle) {
    currentId = rectangles.indexOf(this);
    var currentRectangle = rectangles[currentId];
    var currentLocation = ('\n['+currentRectangle.getBounds().getNorthEast().lat()+', '+currentRectangle.getBounds().getSouthWest().lng()+', '+currentRectangle.getBounds().getSouthWest().lat()+', '+currentRectangle.getBounds().getNorthEast().lng()+']');
    locations.splice(currentId,1,currentLocation);
  }
                       );
}

function removeArea (currentId) {
  rectangles[currentId].setMap(null);
  rectangles.splice(currentId,1);
  locations.splice(currentId,1);
  hideContextMenu();
}

function getRectBounds(rectangle) {
  var bounds = rectangle.getBounds();
  var lat = [bounds.getNorthEast().lat(), bounds.getSouthWest().lat()].sort();
  var lng = [bounds.getSouthWest().lng(), bounds.getNorthEast().lng()].sort();
  return {
    'minLat': lat[0], 'maxLat': lat[1],
    'minLng': lng[0], 'maxLng': lng[1],
  };
}

function copySpawnPoints(){
  hideContextMenu();
  var matched_spawns = [];
  for (var i=0, len=spawns.length; i<len; i++) {
    var lat = spawns[i].lat;
    var lng = spawns[i].lng;
    for (var j=0, len2=rectangles.length; j<len2; j++) {
      var bounds = getRectBounds(rectangles[j]);
      var isInsideLats = bounds.minLat < lat && lat < bounds.maxLat;
      var isInsideLngs = bounds.minLng > lng && lng > bounds.maxLng;
      if (isInsideLats && isInsideLngs) {
        matched_spawns.push({
          'lat': lat,
          'lng': lng,
          'cell': spawns[i].cell,
          'sid': spawns[i].sid,
          'time': spawns[i].time
        });
        break;
      }
    }
  }
  var matched_spawns_str = JSON.stringify(matched_spawns);
  $("#LocationsJSON,#LocationsJSON_hidden").text(matched_spawns_str);
  try {
    $("#LocationsJSON_hidden").select();
    var successful = document.execCommand('copy');
    if (!successful) {
      throw 'copy unsuccessful';
    }
    swal({
      title: "Spawn Points",
      text: matched_spawns.length + ' spawns copied',
      type: "success",
      showConfirmButton: true
    });
  } catch(err) {
    console.log(err);
    $("#LocationsJSON").fadeIn(200)
    $("#LocationsJSON").select();
  }
}


function copyWorkerLocations(){
  hideContextMenu();
  var currentRectangle = rectangles[0]
  var currentLocation = ('['+currentRectangle.getBounds().getNorthEast().lat()+', '+currentRectangle.getBounds().getSouthWest().lng()+', '+currentRectangle.getBounds().getSouthWest().lat()+', '+currentRectangle.getBounds().getNorthEast().lng()+']');
  locations.splice(0,1,currentLocation);
  $("#LocationsJSON,#LocationsJSON_hidden").text(locations.toString())
  try {
    $("#LocationsJSON_hidden").select();
    var successful = document.execCommand('copy');
    if (!successful) {
      throw 'copy unsuccessful';
    }
    swal({
      title: "Locations",
      text: locations.toString(),
      type: "success",
      showConfirmButton: true
    });
  }catch(err){
    console.log(err);
    $("#LocationsJSON").fadeIn(200)
    $("#LocationsJSON").select();
  }
}

function clearAllAreas(){
  for (var i = 0; i < rectangles.length; i++) {
    rectangles[i].setMap(null);
  }
  rectangles = [];
  locations = [];
  hideContextMenu();
}

function initializeLocationGenerator(Lat,Lng) {
  var latlng = new google.maps.LatLng(Lat,Lng);
  var myOptions = {
    zoom: 15,
    center: latlng,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  };
  map = new google.maps.Map(document.getElementById("map_canvas"), myOptions);
  google.maps.event.addListener(map,"rightclick",function(event){showContextMenu(event.latLng);});
  google.maps.event.addListener(map,"click",function(event){hideContextMenu();});
}

