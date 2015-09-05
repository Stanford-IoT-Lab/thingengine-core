// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');

const appdb = require('./engine/db/apps');
const SQLDatabase = require('./engine/db/sqldb');
const Engine = require('./engine');
const Frontend = require('./frontend');

var alljoyn = require('alljoyn');

function main() {
    global.platform = require('./platform');

    var test = process.argv.indexOf('--test') >= 0;
    platform.init(test).then(function() {
        var apps = new appdb.FileAppDatabase(platform.getWritableDir() + '/apps.db');
        var devicesql = new SQLDatabase(platform.getWritableDir() + '/sqlite.db',
                                        'device');
        var engine = new Engine(apps, devicesql);
        var frontend = new Frontend();
        platform._setFrontend(frontend);
        frontend.setEngine(engine);

        var earlyStop = false;
        var engineRunning = false;
        function handleSignal() {
            if (engineRunning)
                engine.stop();
            else
                earlyStop = true;
        }
        //process.on('SIGINT', handleSignal);
        //process.on('SIGTERM', handleSignal);

        return Q.all([engine.open(), frontend.open()]).then(function() {
            frontend.engineLoaded();
            engineRunning = true;
            if (earlyStop)
                return;
            return engine.run().finally(function() {
                return Q.all([engine.close(), frontend.close()]);
            });
        });
    }).then(function () {
        console.log('Cleaning up');
        platform.exit();
    }).done();
}

var portNumber = 27;
var busInterfaceName = "edu.stanford.thingengine.bus"
var advertisedName = "edu.stanford.thingengine.bus.discover"; //"edu.stanford.thingengine.bus.chat";
var busName = "discover";
var busObjectName = "/discoverService"
var discoverMessage = "Hello"


function initAllJoynBus(allJoynState) {
    console.log('initiaing AllJoyn Bus', alljoyn);
    
    console.log("CreateInterface "+allJoynState.bus.createInterface(busInterfaceName, allJoynState.interface));
    console.log("AddSignal "+allJoynState.interface.addSignal(discoverMessage, "s",  "msg"));
    allJoynState.bus.registerBusListener(allJoynState.busListener);

    console.log("Start "+allJoynState.bus.start());
}

function connectToAllJoynBus(allJoynState)
{
    console.log("Connect"+allJoynState.bus.connect());
    
    if(allJoynState.host){
      console.log("RequestName "+allJoynState.bus.requestName(advertisedName));
      console.log("BindSessionPort "+allJoynState.bus.bindSessionPort(portNumber, allJoynState.sessionPortListener));
      console.log("AdvertiseName "+allJoynState.bus.advertiseName(advertisedName));
    }
    else
    {
      console.log("FindAdvertisedName "+allJoynState.bus.findAdvertisedName(advertisedName));
    }
}



function initAllJoynClient() {
    var allJoynState = new Object;
    var discoverObject = alljoyn.BusObject(busObjectName);
    var device = new Object;

    allJoynState.host = false;
    allJoynState.bus = alljoyn.BusAttachment(busName);
    allJoynState.interface = alljoyn.InterfaceDescription();
    allJoynState.busListener = alljoyn.BusListener(
      function(name){
        console.log("FoundAdvertisedName", name);
        device.sessionId = allJoynState.bus.joinSession(name, portNumber, 0);
        console.log("JoinSession "+ device.sessionId);
        setTimeout(function(){
          console.log("trying to send in session " + device.sessionId);
          discoverObject.signal(null, device.sessionId, allJoynState.interface, discoverMessage, "Hello from client!");
        }, 1);
      },
      function(name){
        console.log("LostAdvertisedName", name);
      },
      function(name){
        console.log("NameOwnerChanged", name);
      }
    );

    allJoynState.sessionPortListener = alljoyn.SessionPortListener(
      function(port, joiner){
          console.log("AcceptSessionJoiner", port, joiner);
          return true;
      },
      function(port, sessionId, joiner){
        console.log("SessionJoined", port, sessionId, joiner);
      }
    );

    initAllJoynBus(allJoynState);
    
    console.log("discoverObject.AddInterface "+discoverObject.addInterface(allJoynState.interface));
    console.log("RegisterSignalHandler "+allJoynState.bus.registerSignalHandler(discoverObject, function(msg, info){
      console.log("Signal received: ", msg, info);
      console.log(msg["0"]);
    }, allJoynState.interface, discoverMessage));

    console.log("RegisterBusObject "+allJoynState.bus.registerBusObject(discoverObject));
  
    connectToAllJoynBus(allJoynState);


    // Added Chat to example
    var stdin = process.stdin;

    // without this, we would only get streams once enter is pressed
    stdin.setRawMode( true );

    // resume stdin in the parent process (node app won't quit all by itself
    // unless an error or process.exit() happens)
    stdin.resume();

    // i don't want binary, do you?
    stdin.setEncoding( 'utf8' );

    // on any data into stdin
    stdin.on( 'data', function( key ){
      // ctrl-c ( end of text )
      if ( key === '\u0003' ) {
        process.exit();
      }
      // write the key to stdout all normal like
      process.stdout.write( key + '\n' );
      // chatObject.signal(null, sessionId, inter, 'hello' );
      console.log("device.sessionId " + device.sessionId);
      console.log("allJoynState.interface " + allJoynState.interface);
      discoverObject.signal(null, device.sessionId, allJoynState.interface, discoverMessage, key);
    });
}


function initAllJoynHost() {
  var allJoynState = new Object;
  var discoverObject = alljoyn.BusObject(busObjectName);
  var device = new Object;

  allJoynState.host = true;
  allJoynState.bus = alljoyn.BusAttachment(busName);
  allJoynState.interface = alljoyn.InterfaceDescription();
  allJoynState.busListener = alljoyn.BusListener(
    function(name){
      console.log("FoundAdvertisedName", name);
      device.sessionId = allJoynState.bus.joinSession(name, portNumber, 0);
      console.log("JoinSession "+ device.sessionId);
    },
    function(name){
      console.log("LostAdvertisedName", name);
    },
    function(name){
      console.log("NameOwnerChanged", name);
    }
  );

  allJoynState.sessionPortListener = alljoyn.SessionPortListener(
    function(port, joiner){
        console.log("AcceptSessionJoiner", port, joiner);
        return port == portNumber;
    },
    function(port, sessionId, joiner){
      console.log("SessionJoined", port, sessionId, joiner);
      device.sessionId = sessionId;
      setTimeout(function(){
        discoverObject.signal(null, device.sessionId, allJoynState.interface, discoverMessage, "Hello from host!");
      }, 1000);
    }
  );

  initAllJoynBus(allJoynState);
  
  console.log("discoverObject.AddInterface "+discoverObject.addInterface(allJoynState.interface));
  console.log("RegisterSignalHandler "+allJoynState.bus.registerSignalHandler(discoverObject, function(msg, info){
    console.log("Signal received: ", msg, info);
    console.log(msg["0"]);
  }, allJoynState.interface, discoverMessage));

  console.log("RegisterBusObject "+allJoynState.bus.registerBusObject(discoverObject));

  connectToAllJoynBus(allJoynState);

  // Added Chat to example
  var stdin = process.stdin;

  // without this, we would only get streams once enter is pressed
  stdin.setRawMode( true );

  // resume stdin in the parent process (node app won't quit all by itself
  // unless an error or process.exit() happens)
  stdin.resume();

  // i don't want binary, do you?
  stdin.setEncoding( 'utf8' );

  // on any data into stdin
  stdin.on( 'data', function( key ){
    // ctrl-c ( end of text )
    if ( key === '\u0003' ) {
      process.exit();
    }
    // write the key to stdout all normal like
    process.stdout.write( key + '\n' );
    // chatObject.signal(null, sessionId, inter, 'hello' );
    console.log("device.sessionId " + device.sessionId);
    console.log("allJoynState.interface " + allJoynState.interface);
    discoverObject.signal(null, device.sessionId, allJoynState.interface, discoverMessage, key);
  });
}

initAllJoynClient();
main();
