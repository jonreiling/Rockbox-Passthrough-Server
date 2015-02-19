var http = require('http');
var express = require('express');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server, {"log":true});

var currentTrack;
var currentVolume;
var currentState;

var connectedToPlayer = false;

var ipaddr = process.env.OPENSHIFT_INTERNAL_IP || "127.0.0.1";
var port = process.env.OPENSHIFT_INTERNAL_PORT || 8080;

app.get('/status', function(req, res){
  res.send({'connected':connectedToPlayer});
});

app.get('/', function(req, res){
  res.send('');
});

var server_port = process.env.OPENSHIFT_NODEJS_PORT || 3000
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1'
 
server.listen(server_port, server_ip_address, function () {
  console.log( "Listening on " + server_ip_address + ", server_port " + server_port )
});



var playerSocket = io
	.of('rockbox-player')
	.on('connection', function (socket) {
		
		console.log( "Player connected" );
		connectedToPlayer = true;

		socket.on('trackUpdate',function(data) {
			currentTrack = data;
			io.of('/rockbox-client').emit('trackUpdate',currentTrack);
		})

		socket.on('stateUpdate',function(data) {
			currentState = data;
			io.of('/rockbox-client').emit('stateUpdate',currentState);
		})	

		socket.on('volumeUpdate',function(data) {
			currentVolume = data;
			io.of('/rockbox-client').emit('volumeUpdate',currentVolume);
		})

		socket.on('disconnect',function() {
			currentTrack = null;
			io.of('/rockbox-client').emit('trackUpdate',null);
			connectedToPlayer = false;
		});

	})

var clientSocket = io
	.of('rockbox-client')
	.on('connection', function (socket) {

		socket.emit('trackUpdate',currentTrack);
		socket.emit('volumeUpdate',currentVolume);
		socket.emit('stateUpdate',currentState);

		socket.on('pause',function() {
			io.of('/rockbox-player').emit('pause');
		});

		socket.on('skip',function() {
			io.of('/rockbox-player').emit('skip');
		});

		socket.on('play',function(trackId) {
			io.of('/rockbox-player').emit('play',trackId);
		});



	});


