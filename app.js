require( "console-stamp" )( console, { pattern : "mm/dd/yyyy HH:MM:ss.l" } );

var express = require('express')

var app = express();
var server = require('http').Server(app);
var bodyParser = require('body-parser');
var spotifyHelper = new (require('./libs/spotify-helper'))();
var stateManager = new (require('./libs/state-manager'))();
var queueManager = new (require('./libs/queue-manager'))(spotifyHelper);
var socketManager = new (require('./libs/socket-manager'))( {"stateManager":stateManager,"queueManager":queueManager,"server":server}); 

// -----------------------------------------------------------------------------
// Set up managers
// -----------------------------------------------------------------------------

queueManager.addListener('queueUpdate',function() {
	console.log('queueUpdate');
	socketManager.emitQueueUpdate();
});

queueManager.addListener('trackUpdate',function() {

	if ( queueManager.currentTrack != null ) {
		console.log(queueManager.currentTrack.id);
		socketManager.playerAddTrack(queueManager.currentTrack.id);	
	}

	if ( !stateManager.isPlaying ) stateManager.setIsPlaying( true );
	socketManager.emitTrackUpdate();

});

stateManager.addListener('playStateUpdate',function(newState) {

	socketManager.playerSetState(newState);
	socketManager.emitPlayStateUpdate();

});

stateManager.addListener('volumeUpdate',function(newVolume) {
	socketManager.emitVolumeUpdate();
});

stateManager.addListener('connectionUpdate',function(connected) {
	stateManager.reset();	
	socketManager.emitConnectionUpdate();
});


// -----------------------------------------------------------------------------
// Server Set-up
// -----------------------------------------------------------------------------


var server_port = process.env.OPENSHIFT_NODEJS_PORT || 3000
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1'

server.listen(server_port, server_ip_address, function () {
  console.log( "Listening on " + server_ip_address + ", server_port " + server_port )
});


var routerApi = express.Router();

routerApi.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  next();
});


routerApi.use(function (req, res, next) {

	if ( !stateManager.connectedToPlayer ) {
		sendError(res,"Not connected to player");
	} else {
		next();
	}
});

routerApi.use(bodyParser.json()); // for parsing application/json
routerApi.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.use('/api/v1/', routerApi)

// -----------------------------------------------------------------------------
// OAuth routes for Spotify
// -----------------------------------------------------------------------------

app.get('/authorize',function(req,res){
  res.redirect(spotifyHelper.getAuthURL());
});

app.get('/callback', function(req, res){
  console.log('authorize recieved',req.query.code);
  spotifyHelper.handleAuthCallback(req.query.code);
  res.send("");
});


// -----------------------------------------------------------------------------
// GET Routes
// -----------------------------------------------------------------------------

app.get('/', function(req, res){
  res.send({'connected':stateManager.connectedToPlayer});
});


routerApi.get('/search/:searchterm',function(req,res) {

	spotifyHelper.search( req.params.searchterm , function( results ) {
		sendSuccess(res, results);
	});

});

routerApi.get('/direct-search/',function(req,res) {
	
	if (req.query.artist == null ) sendError(res,"artist required");

	if ( req.query.album != null ) {
		spotifyHelper.directSearchAlbum( req.query.artist , req.query.album , function(results) {
			sendSuccess(res,results);
		});
	}

	if ( req.query.track != null ) {
		spotifyHelper.directSearchTrack( req.query.artist , req.query.track , function(results) {
			sendSuccess(res,results);
		});
	}	

});


routerApi.get('/browse/artist/spotify\:artist\::id',function(req,res) {
	
	spotifyHelper.getArtist(req.params.id, function(results) {
		sendSuccess(res, results);
	})

});

routerApi.get('/browse/album/spotify\:album\::id',function(req,res) {
	
	spotifyHelper.getAlbum(req.params.id, function(results) {
		sendSuccess(res, results);
	})
});

routerApi.get('/browse/new-releases',function(req,res) {

	spotifyHelper.getNewReleases( function(results) {
		sendSuccess(res, results);
	});
});

routerApi.get('/volume/', function(req, res){

	sendSuccess(res, {"volume":stateManager.volume});
});

routerApi.get('/queue',function(req,res) {
	sendSuccess(res, queueManager.queue);
});

routerApi.get('/fullstatus',function(req,res) {
	sendSuccess(res, {'state':stateManager.isPlaying,'volume':stateManager.volume,'queue':currentQueue.queue,'stateManager.connectedToPlayer':stateManager.connectedToPlayer});
});

routerApi.get('/nowplaying',function(req,res) {

	if ( queueManager.currentTrack == null ) {
		sendSuccess(res,"Nothing is currently playing");
	} else {
		sendSuccess(res,queueManager.currentTrack.name + " - " + queueManager.currentTrack.artist.name);
	}
});


routerApi.get('/radio/create',function(req,res) {

	var configuration = {};

	configuration.variants = [];
	configuration.variants.push( { "name":"Normal" , "attributes":{ } } );
	configuration.variants.push( { "name":"Upbeat" , "attributes":{ "min_valence":.8 } } );
	configuration.variants.push( { "name":"Chill" , "attributes":{ "min_instrumentalness":.6 ,"target_energy":.2 } } );
	configuration.variants.push( { "name":"Dancable" , "attributes":{ "target_danceability":.8 } } );

	spotifyHelper.spotifyApi.getAvailableGenreSeeds()
  		.then(function(data) {
  			configuration.genres = data.body.genres;
  			res.send(configuration);
 	 }, function(err) {
 	 	res.send(err);
	  });
});

// -----------------------------------------------------------------------------
// POST Routes
// -----------------------------------------------------------------------------

routerApi.post('/add/', function(req, res){

	queueManager.add(req.body.id , function(added) {
		sendSuccess(res,added);
	} );
});

routerApi.post('/pause', function(req, res){

	if ( queueManager.currentTrack != null ) {
		stateManager.togglePlayPause();
	}
	sendSuccess(res, {'playing':stateManager.isPlaying} );
});


routerApi.post('/radio/create',function(req,res) {
	console.log(req.params);
	console.log(req.body);
});

routerApi.post('/skip', function(req, res){
	queueManager.gotoNextTrack(function(track) {
		sendSuccess(res, track);
	})
});

routerApi.post('/volume', function(req, res){

	if ( req.body.volume ) stateManager.setVolume(req.body.volume);
	if ( req.body.bump && req.body.bump == 'down' ) stateManager.bumpVolumeDown();
	if ( req.body.bump && req.body.bump == 'up' ) stateManager.bumpVolumeUp();
	sendSuccess(res, {'volume':stateManager.volume} );

});

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function sendSuccess(res,data) {
	var result = {};
	result.status = "success";
	result.results = ( data ) ? data : {};
	res.send(result);
}

function sendError(res,message) {
	res.status(500).send( {"status":"error","message":message } );

}
//Sockets

