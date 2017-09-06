module.exports = SocketManager;


var events = require('events');
var connectedPlayers = 0;


/**
	Constructor.
*/
function SocketManager(options) {

	events.EventEmitter.call(this);

	this.io = require('socket.io')(options.server);
	this.stateManager = options.stateManager;
  	this.queueManager = options.queueManager;

  	this.setPlayerSocket();
  	this.setClientSocket();

}

/**
	Set up class to inheret event emitter. 
*/
SocketManager.super_ = events.EventEmitter;
SocketManager.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        enumerable: false,
    }
});

SocketManager.prototype.playerAddTrack = function(id) {
	this.io.of('/rockbox-player').emit('play',id);
}


SocketManager.prototype.playerSetState = function( newState ) {
	if ( newState ) {
		this.io.of('/rockbox-player').emit('resume');
	} else {
		this.io.of('/rockbox-player').emit('pause');
	}	
}

SocketManager.prototype.playerSetVolume = function( volume ) {
	this.io.of('/rockbox-player').emit('setVolume',volume);	
}

SocketManager.prototype.emitQueueUpdate = function() {

	this.io.of('/rockbox-client').emit('queueUpdate',{"queue":this.queueManager.queue});
}

SocketManager.prototype.emitTrackUpdate = function(socket) {

	if ( socket == null ) socket = this.io.of('/rockbox-client');
	socket.emit('trackUpdate',{"currentTrack":this.queueManager.currentTrack});
}

SocketManager.prototype.emitVolumeUpdate = function(socket) {
	if ( socket == null ) socket = this.io.of('/rockbox-client');
	socket.emit('volumeUpdate',{"volume":this.stateManager.volume});
}

SocketManager.prototype.emitPlayStateUpdate = function(socket) {
	if ( socket == null ) socket = this.io.of('/rockbox-client');
	socket.emit('playStateUpdate',{"playing":this.stateManager.isPlaying});
}

SocketManager.prototype.emitConnectionUpdate = function(socket) {
	if ( socket == null ) socket = this.io.of('/rockbox-client');
	socket.emit('connectionUpdate',{"connectedToPlayer":this.stateManager.connectedToPlayer});
}


SocketManager.prototype.setPlayerSocket = function() {

  var scope = this;

  this.playerSocket = this.io
	.of('/rockbox-player')
	.on('connection', function (socket) {

		connectedPlayers ++;

		console.log( "Player connected" );

		scope.stateManager.setConnectedToPlayer(true);
		scope.emitConnectionUpdate();

		socket.on('disconnect',function(data) {

			connectedPlayers --;

			console.info('Disconnected from player');

			if ( connectedPlayers == 0 ) {
				scope.stateManager.setConnectedToPlayer(false);
//				scope.queueManager.empty();
			}

		})		

		socket.on('endOfTrack',function(data) {
			scope.queueManager.gotoNextTrack();
		})

		socket.on('playTokenLost',function() {
			console.log('Play Token Lost');
			scope.stateManager.setIsPlaying(false);
		})


	});	
}

SocketManager.prototype.setClientSocket = function() {

	var scope = this;

	this.clientSocket = this.io
	.of('rockbox-client')
	.on('connection', function (socket) {
		
		console.log( 'socket connect' );

		scope.emitQueueUpdate(socket);
		scope.emitTrackUpdate(socket);
		scope.emitPlayStateUpdate(socket);
		scope.emitVolumeUpdate(socket);
		scope.emitConnectionUpdate(socket);

	});
}



