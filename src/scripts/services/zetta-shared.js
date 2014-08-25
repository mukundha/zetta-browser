angular.module('zetta').factory('zettaShared', function() {
  var servers = [];
  var root = null;
  var breadcrumbs = [];
  var pinned = [];
  var muted = [];
  var savedStreams = [];
  var getAssumedStreamType = function(stream) {
    return isNaN(parseInt(stream.current))
            ? 'categorical'
            : 'numerical';
  };

  var wireUpStreams = function(device, cb) {
    device.streams.forEach(function(stream) {
      var oldOnMessage = stream.socket.onmessage;
      stream.socket.onmessage = function(event) {
        if (oldOnMessage) {
          oldOnMessage(event);
        }

        //Add data to model w/ timestamp here
        var d = JSON.parse(event.data);

        var update = {
          target: d.topic.replace(/\//g, '_'),
          data: d.data
        }

        var color;
        stream.data.push([new Date(), update.data]);

        stream.current = update.data;

        stream.type = getAssumedStreamType(stream);

        if (stream.min === null) {
          stream.min = d.data;
        }

        if (stream.max === null) {
          stream.max = d.data;
        }

        if (d.data < stream.min) {
          stream.min = d.data;
        }

        if (d.data > stream.max) {
          stream.max = d.data;
        }

        if(stream.data.length > 40){
          stream.data.shift();
        }

        cb();
      }
    });
  };

  var buildDeviceFromData = function(deviceData) {
    if (typeof deviceData === 'string') {
      deviceData = JSON.parse(deviceData);
    }

    var device = {
      properties: deviceData.properties
    };

    deviceData.links.forEach(function(link) {
      if (link.rel.indexOf('self') !== -1) {
        device.href = link.href;
      }
    });

    var objectStreamLinks = deviceData.links.filter(function(link) {
      return link.rel.indexOf('http://rels.zettajs.io/object-stream') !== -1;
    });

    if (objectStreamLinks.length) {
      device.streams = [];
    }

    objectStreamLinks.forEach(function(objectStream) {
      if (savedStreams.hasOwnProperty(objectStream.href)) {
        var stream = savedStreams[objectStream.href];
        device.streams.push(stream);
        return;
      }

      if (objectStream.title === 'logs') {
        device.monitorHref = objectStream.href;
      } else {
        var stream = {
          name: objectStream.title,
          href: objectStream.href,
          socket: new WebSocket(objectStream.href),
          device: device,
          data: [],
          pinned: false,
          muted: false,
          min: null,
          max: null,
          type: null,
          current: objectStream.rel.indexOf('monitor') !== -1
                    ? device.properties[objectStream.title] : null,
        };

        stream.socket.onclose = function() {
          var oldOnMessage = stream.socket.onmessage;
          stream.socket = new WebSocket(stream.href);
          stream.socket.onmessage = oldOnMessage;
        };

        stream.type = getAssumedStreamType(stream);

        savedStreams[stream.href] = stream;
        device.streams.push(stream);
      }
    });

    device.links = deviceData.links;

    if (deviceData.actions) {
      device.actions = deviceData.actions.map(function(action) {
        action.device = device;
        action.available = true;
        return action;
      }).sort(function(a, b) {
        var identifierA = a.name;
        var identifierB = b.name;

        if (identifierA > identifierB) {
          return 1;
        } else if (identifierA < identifierB) {
          return -1; 
        } else {
          return 0;
        }
      });
    }

    return device;
  };

  return {
    servers: servers,
    pinned: pinned,
    muted: muted,
    root: root,
    breadcrumbs: breadcrumbs,
    wireUpStreams: wireUpStreams,
    getAssumedStreamType: getAssumedStreamType,
    buildDeviceFromData: buildDeviceFromData
  };
});

