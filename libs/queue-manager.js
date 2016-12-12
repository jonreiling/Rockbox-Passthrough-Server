module.exports = QueueManager;
var events = require('events');

QueueManager.super_ = events.EventEmitter;
QueueManager.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        enumerable: false,

    }
});

function QueueManager( spotifyHelper ) {

	this.queue = [];
	this.pendingQueue = [];
	this.currentTrack = null;
	this.processingPendingQueue = false;
	this.spotifyHelper = spotifyHelper;
	this.radioQueue = [];
};

QueueManager.prototype.empty = function() {
	this.queue = [];
	this.pendingQueue = [];
	this.radioQueue = [];
	this.emit( 'queueUpdate' );
	this.setCurrentTrack(null);	

}


QueueManager.prototype.gotoNextTrack = function(callback) {

	var scope = this;

	if ( this.queue.length == 0 && this.currentTrack != null ) {
		
		if ( this.radioQueue.length == 0 ) {

			this.fetchRadioQueue( this.currentTrack.id ,function() {
				scope.setCurrentTrack(scope.radioQueue.shift());
				if ( callback != null ) callback(scope.currentTrack);
			});

		} else {

			this.setCurrentTrack(this.radioQueue.shift());
			if ( callback != null ) callback(this.currentTrack);

		}

	} else if (this.queue.length != 0 ){

		//Load the radio tracks early.
		if ( this.queue.length < 2 && this.radioQueue.length == 0 ) {
			this.fetchRadioQueue(this.queue[this.queue.length - 1].id,function(){});
		}

		this.setCurrentTrack(this.queue.shift());
		if ( callback != null ) callback(this.currentTrack);

		this.emit( 'queueUpdate' );

	} else {
		if ( callback ) callback( {} );
	}
}

QueueManager.prototype.setCurrentTrack = function(track) {

	this.currentTrack = track;
	this.emit( 'trackUpdate' );
}

QueueManager.prototype.add = function(id,callback) {

	this.pendingQueue.push({"id":id,"callback":callback});
	this.radioQueue = [];

	if (!this.processingPendingQueue) {
		this.processPendingQueue();
	}
};


QueueManager.prototype.processPendingQueue = function() {

	var scope = this;

	if ( this.pendingQueue.length == 0 ) {

		this.processingPendingQueue = false;

		if ( this.currentTrack == null ){
			this.gotoNextTrack();
		} else {
			this.emit( 'queueUpdate' );
		}

	} else {

		this.processingPendingQueue = true;

		var currentObj = this.pendingQueue.shift();
		var currentId = currentObj.id;

		if ( currentId.indexOf(":track:") != -1 ) {

			currentId = currentId.replace('spotify:track:','');

			this.spotifyHelper.spotifyApi.getTrack(currentId)
			  .then(function(data) {
			  	var track = scope.spotifyHelper.simplifyTrack( data.body );
			  	scope.queue.push( track );
			  	scope.processPendingQueue();
			  	if ( currentObj.callback ) currentObj.callback( track );

			  }, function(err) {
			    console.error(err);
			  	this.processPendingQueue();
			  });

		} else if ( currentId.indexOf(":album:") != -1 ) {

			currentId = currentId.replace('spotify:album:','');

			this.spotifyHelper.spotifyApi.getAlbum(currentId)
			  .then(function(data) {

			    return data.body.tracks.items.map(function(t) { return t.id; });
			  })
			  .then(function(trackIds) {
			    return scope.spotifyHelper.spotifyApi.getTracks(trackIds);
			  })
			  .then(function(data) {

			  	var tracks = scope.spotifyHelper.simplifyTracks( data.body.tracks)

			  	scope.queue = scope.queue.concat(tracks);
			  	scope.processPendingQueue();
			  	if ( currentObj.callback ) currentObj.callback( tracks );

			  })
			  .catch(function(err) {
			    console.error(err);
			  	this.processPendingQueue();
			  });

		}

	}
};

QueueManager.prototype.fetchRadioQueue = function(seed,callback) {

	var scope = this;

	seed = seed.replace('spotify:track:','');

	this.spotifyHelper.spotifyApi.getRecommendations( { "seed_tracks": [seed] , limit:100 } )
	  .then(function(data) {


	  	var tracks = scope.spotifyHelper.simplifyTracks( data.body.tracks );
	  	for ( var i = 0 ; i < tracks.length ; i ++ ) tracks[i].radio = true;
	  	scope.radioQueue = scope.radioQueue.concat(tracks);
	  	
	  	callback();
	  }, function(err) {
	    console.error(err);
	    callback();
	  });

};