var http = require('http');
var express = require('express');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server, {"log":true});
var request = require('request');

var currentQueue;
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

app.get('/ip', function(req, res){
  res.send({'ip':server_ip_address});
});

app.get('/api/add/:id', function(req, res){
	io.of('/rockbox-player').emit('add', req.params.id );
	res.send({'success':connectedToPlayer});
});

app.get('/api/pause', function(req, res){
	io.of('/rockbox-player').emit('pause');
	res.send({'success':connectedToPlayer});
});

app.get('/api/skip', function(req, res){
	io.of('/rockbox-player').emit('skip');
	res.send({'success':connectedToPlayer});
});

app.get('/api/volume/:volume', function(req, res){
	io.of('/rockbox-player').emit('setVolume',req.params.volume );
	res.send({'success':connectedToPlayer});
});

app.get('/api/radio/:onOff', function(req, res){
	io.of('/rockbox-player').emit('setRadio' , (req.params.onOff=='on') );
	res.send({'success':connectedToPlayer});
});

app.get('/api/queue',function(req,res) {
	res.send(currentQueue);
});

app.get('/api/fullstatus',function(req,res) {
	res.send({'state':currentState,'volume':currentVolume,'queue':currentQueue.queue,'connectedToPlayer':connectedToPlayer});
});

app.get('/api/nowplaying',function(req,res) {
		
	if ( currentQueue.queue.length == 0 ) {
		res.send("Nothing is currently playing");
	} else {
		res.send(currentQueue.queue[0].name + " - " + currentQueue.queue[0].artists[0].name);
	}
});

var playerSocket = io
	.of('rockbox-player')
	.on('connection', function (socket) {
		
		console.log( "Player connected" );
		connectedToPlayer = true;
		io.of('/rockbox-client').emit('passthroughConnectionUpdate',{'connected':true});

		socket.on('queueUpdate',function(data) {
			currentQueue = data;
			io.of('/rockbox-client').emit('queueUpdate',currentQueue);
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
			currentQueue = null;
			io.of('/rockbox-client').emit('queueUpdate',{'queue':[]});
			io.of('/rockbox-client').emit('passthroughConnectionUpdate',{'connected':false});
			connectedToPlayer = false;
		});

	})

var clientSocket = io
	.of('rockbox-client')
	.on('connection', function (socket) {

		socket.emit('queueUpdate',currentQueue);
		socket.emit('volumeUpdate',currentVolume);
		socket.emit('stateUpdate',currentState);
		socket.emit('connectionUpdate',connectedToPlayer);

		socket.on('pause',function() {
			io.of('/rockbox-player').emit('pause');
		});

		socket.on('skip',function() {
			io.of('/rockbox-player').emit('skip');
		});

		socket.on('add',function(trackId) {
			io.of('/rockbox-player').emit('add',trackId);
		});

		socket.on('setVolume',function(vol) {
			io.of('/rockbox-player').emit('setVolume',vol);
		});

		socket.on('setRadio',function(onOff) {
			io.of('/rockbox-player').emit('setRadio',onOff);
		});

	});


