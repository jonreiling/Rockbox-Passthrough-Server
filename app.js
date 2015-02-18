var http = require('http');
var express = require('express');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server, {"log":true});

var currentTrack;
var currentVolume;
var currentState;

app.get('/', function(req, res){
  res.send('');
});

server.listen(3000, function(){
	console.log('Express server listening on port ' + app.get('port'));
});

var playerSocket = io
	.of('rockbox-player')
	.on('connection', function (socket) {
		
		console.log( "Player connected" );


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

	})
	.on('disconnect',function() {
		currentTrack = null;
		io.of('/rockbox-client').emit('trackUpdate',null);

	});

var clientSocket = io
	.of('rockbox-client')
	.on('connection', function (socket) {

		socket.emit('trackUpdate',currentTrack);
		socket.emit('volumeUpdate',currentState);
		socket.emit('stateUpdate',currentVolume);

		socket.on('pause',function() {
			io.of('/rockbox-player').emit('pause');
		});

		socket.on('play',function(trackId) {
			io.of('/rockbox-player').emit('play',trackId);
		});

	});


