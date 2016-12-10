module.exports = StateManager;


var events = require('events');


/**
	Constructor.
*/
function StateManager() {

  events.EventEmitter.call(this);

	this.isPlaying = false;
	this.volume = 30;
	this.connectedToPlayer = false;
}

/**
	Set up class to inheret event emitter. 
*/
StateManager.super_ = events.EventEmitter;
StateManager.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        enumerable: false,
    }
});

StateManager.prototype.reset = function() {
	this.setIsPlaying( false );
	this.setVolume( 30 );
}

StateManager.prototype.setIsPlaying = function( playing ){

	this.isPlaying = playing;
	this.emit( 'playStateUpdate' , playing );

};

StateManager.prototype.togglePlayPause = function( playing ){
	this.setIsPlaying( !this.isPlaying );
};


StateManager.prototype.setVolume = function( vol ){

	if ( isNaN( vol ) ) return;
	
	this.volume = Math.max( 0 , Math.min( 100, vol ) );;
	this.emit( 'volumeUpdate' , this.volume );

};

StateManager.prototype.bumpVolumeUp = function(){
	this.setVolume( this.volume + 10 );
};

StateManager.prototype.bumpVolumeDown = function(){
	this.setVolume( this.volume - 10 );
};

StateManager.prototype.setConnectedToPlayer = function( connected ) {
	this.connectedToPlayer = connected;
	this.emit('connectionUpdate',this.connectedToPlayer);
}

