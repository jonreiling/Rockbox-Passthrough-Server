var http = require('http');
var express = require('express');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server, {"log":true});
var request = require('request');

var currentTrack;
var currentVolume;
var currentState;

var connectedToPlayer = false;

var server_port = process.env.OPENSHIFT_NODEJS_PORT || 3000
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1'
 
server.listen(server_port, server_ip_address, function () {
  console.log( "Listening on " + server_ip_address + ", server_port " + server_port )
});

app.get('/', function(req, res){
  res.send({'connected':connectedToPlayer});
});

app.get('/status', function(req, res){
  res.send({'connected':connectedToPlayer});
});

app.get('/ip', function(req, res){
  res.send({'ip':server_ip_address});
});

app.get('/', function(req, res){
  res.send('');
});

app.get('/api/pause', function(req, res){
	io.of('/rockbox-player').emit('pause');
	res.send({'success':connectedToPlayer});
});

app.get('/api/skip', function(req, res){
	io.of('/rockbox-player').emit('skip');
	res.send({'success':connectedToPlayer});
});

app.get('/api/volume/up', function(req, res){
	io.of('/rockbox-player').emit('setVolume','up');
	res.send({'success':connectedToPlayer});
});

app.get('/api/volume/down', function(req, res){
	io.of('/rockbox-player').emit('setVolume','down');
	res.send({'success':connectedToPlayer});
});

app.get('/api/volume/normal', function(req, res){
	io.of('/rockbox-player').emit('setVolume','normal');
	res.send({'success':connectedToPlayer});
});

app.get('/api/volume/low', function(req, res){
	io.of('/rockbox-player').emit('setVolume','low');
	res.send({'success':connectedToPlayer});
});

app.get('/images/:album', function(req, res){
	var id = req.params.album;
	id = id.replace("spotify:album:","");


	request( 'https://api.spotify.com/v1/albums/' + id , function (error, response, body) {

		if (!error){

			var json = JSON.parse( body );
			console.log(json.images[0].url);

			res.writeHead(302, {location:json.images[0].url});
			res.end();

		} else {
			res.send('');
		}
	});

	console.log(id);

});


var playerSocket = io
	.of('rockbox-player')
	.on('connection', function (socket) {
		
		console.log( "Player connected" );
		connectedToPlayer = true;
		io.of('/rockbox-client').emit('connectionUpdate',true);

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
			io.of('/rockbox-client').emit('connectionUpdate',false);
			connectedToPlayer = false;
		});

	})

var clientSocket = io
	.of('rockbox-client')
	.on('connection', function (socket) {

		socket.emit('trackUpdate',currentTrack);
		socket.emit('volumeUpdate',currentVolume);
		socket.emit('stateUpdate',currentState);
		io.of('/rockbox-client').emit('connectionUpdate',connectedToPlayer);

		socket.on('pause',function() {
			io.of('/rockbox-player').emit('pause');
		});

		socket.on('skip',function() {
			io.of('/rockbox-player').emit('skip');
		});

		socket.on('play',function(trackId) {
			io.of('/rockbox-player').emit('play',trackId);
		});

		socket.on('setVolume',function(vol) {
			io.of('/rockbox-player').emit('setVolume',vol);
		});

		socket.on('setRadio',function(onOff) {
			io.of('/rockbox-player').emit('setRadio',onOff);
		});

	});


