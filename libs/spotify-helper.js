module.exports = SpotifyHelper;


var events = require('events');
var storage = require('node-persist');
var SpotifyWebApi = require('spotify-web-api-node');

if ( process.env.OPENSHIFT_DATA_DIR ) {

  console.log('openshift data dir', process.env.OPENSHIFT_DATA_DIR);
  storage.initSync({'dir':process.env.OPENSHIFT_DATA_DIR});

} else {
  storage.initSync();
}

/**
	Constructor.
*/
function SpotifyHelper() {

    events.EventEmitter.call(this);
	
	this.refreshTokenIntervalReference = undefined;
	this.refreshTokenTimeout = 1000 * 60 * 55; //Every 55 minutes.

	// credentials are optional
	this.spotifyApi = new SpotifyWebApi({
	  clientId : process.env.CLIENT_ID,
	  clientSecret : process.env.CLIENT_SECRET,
	  redirectUri : process.env.REDIRECT_URI
	});

	this.init();
}

/**
	Set up class to inheret event emitter. 
*/
SpotifyHelper.super_ = events.EventEmitter;
SpotifyHelper.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        enumerable: false,
    }
});

SpotifyHelper.prototype.init = function(){
	this.spotifyApi.setRefreshToken(storage.getItemSync('refresh_token'));
	this.refreshAccessToken();
};

SpotifyHelper.prototype.search = function(searchterm,callback) {

  var scope = this;

  this.spotifyApi.search(searchterm,['album','artist','track'],{limit:20})
  .then(function(data) {

      var response = {};

      response.tracks = scope.simplifyTracks(data.body.tracks.items);
      response.albums = scope.simplifyAlbums(data.body.albums.items);
      response.artists = scope.simplifyArtists(data.body.artists.items);

      if ( response.albums.length > 10 ) response.albums.length = 10;
      if ( response.artists.length > 4 ) response.artists.length = 4;

      callback(response);


    }, function(err) {
        scope.handleError('search',err);
        callback(null);

    });
};

SpotifyHelper.prototype.directSearchAlbum = function(artistQuery,albumQuery,callback) {

    var query = 'album:' +albumQuery +' artist:' + artistQuery;
    var scope = this;

    this.spotifyApi.searchAlbums(query ,{limit:1})
    .then(function(data) {

      if ( data.body.albums.items.length == 0 ) {
        callback(null);
      } else {

        var result = {};
        result.album = scope.simplifyAlbum(data.body.albums.items[0]);
        result.exact = ( result.album.name.toLowerCase() == albumQuery.toLowerCase() && result.album.artist.name.toLowerCase() == artistQuery.toLowerCase());

        callback(result);

      }

    }, function(err) {
      scope.handleError('directSearchAlbum',err);
      callback(null);
    });     
};

SpotifyHelper.prototype.directSearchTrack = function(artistQuery,trackQuery,callback) {

    var query = 'track:' +trackQuery +' artist:' + artistQuery;
    var scope = this;

    this.spotifyApi.searchTracks(query ,{limit:1})
    .then(function(data) {

      if ( data.body.tracks.items.length == 0 ) {

        callback(null);

      } else {

        var result = {};
        result.track = scope.simplifyTrack(data.body.tracks.items[0]);
        result.exact = ( result.track.name.toLowerCase() == trackQuery.toLowerCase() && result.track.artist.name.toLowerCase() == artistQuery.toLowerCase());

        callback(result);
      }

    }, function(err) {
      scope.handleError('directSearchTrack',err);
      callback(null);
     });       
};

SpotifyHelper.prototype.getArtist = function( id , callback ) {

  var scope = this;
  var artist = {};

  //First, grab basic artist data.
  this.spotifyApi.getArtist(id)
    .then(function(artistData) {

        artist = scope.simplifyArtist(artistData.body);
  
        //Grab the albums by that arist.
        return scope.spotifyApi.getArtistAlbums(id,{limit:50,album_type:'album,ep',market:'US'});

      }).then(function(albumData) {

        artist.albums = scope.simplifyAlbums(albumData.body.items);

        //Grab the top tracks by that arist.
      return scope.spotifyApi.getArtistTopTracks(id,'US');

    }).then(function(trackData) {

      var artistCopy = JSON.parse(JSON.stringify(artist));
      artist.topTracks = scope.simplifyTracks(trackData.body.tracks);
      callback(artist);

    }, function(err) {
      scope.handleError('getArtist',err);
      callback(null);
    });


}

SpotifyHelper.prototype.getAlbum = function( id , callback ) {

  var scope = this;
  var album = {};

  this.spotifyApi.getAlbum(id)
    .then(function(albumData) {
      
      album = scope.simplifyAlbum(albumData.body);
      album.tracks = scope.simplifyTracks(albumData.body.tracks.items,JSON.parse(JSON.stringify(album)));
      album.release_date = new Date(Date.parse(albumData.body.release_date)).getFullYear();
      callback(album);

    }, function(err) {
      scope.handleError('getAlbum',err);
      callback(null);
    });

}

SpotifyHelper.prototype.getNewReleases = function( callback ) {

  var scope = this;
  
  this.spotifyApi.getNewReleases({"country": "US"})
    .then(function(data) {
        var albums = scope.simplifyAlbums(data.body.albums.items);
        callback(albums);

      }, function(err) {
        scope.handleError('getNewReleases',err);
        callback(null);
      });  
}

SpotifyHelper.prototype.simplifyTracks = function( items , album ) {

  var tracks = [];

  for (var i = 0 ; i < items.length ; i ++ ) {
    var track = this.simplifyTrack( items[i] , album);
    tracks.push( track );
  }
  return tracks;

}

SpotifyHelper.prototype.simplifyTrack = function( track , album ) {
  var simplifiedTrack = {};
  simplifiedTrack.name = track.name;
  simplifiedTrack.id = track.uri;
  simplifiedTrack.explicit = track.explicit;

  simplifiedTrack.artist = {};
//  simplifiedTrack.artist.name = this.joinArtistNames(track.artists);
  simplifiedTrack.artist.name = track.artists[0].name;
  simplifiedTrack.artist.id = track.artists[0].uri;

  if ( album ) {
    simplifiedTrack.album = album;
  } else {
    simplifiedTrack.album = {};
    simplifiedTrack.album.name = track.album.name;
    simplifiedTrack.album.id = track.album.uri;
    simplifiedTrack.album.image = ( track.album.images.length != 0 ) ? track.album.images[0].url : null;

  }

  return simplifiedTrack;
};


SpotifyHelper.prototype.simplifyAlbums = function( items ) {

  var albums = [];
  var lastAlbum = { name: '' };

  for (var i = 0 ; i < items.length ; i ++ ) {
    var album = this.simplifyAlbum( items[i] );

    //Remove duplicates
    if ( album.name != lastAlbum.name ) albums.push( album );

    lastAlbum = album;
  }
  return albums;

}

SpotifyHelper.prototype.simplifyAlbum = function( album ) {

  var simplifiedAlbum = {};
  simplifiedAlbum.name = album.name;
  simplifiedAlbum.id = album.uri;
  simplifiedAlbum.image = ( album.images.length != 0 ) ? album.images[0].url : null;

  simplifiedAlbum.artist = {};
  simplifiedAlbum.artist.name = this.joinArtistNames(album.artists);
  simplifiedAlbum.artist.id = album.artists[0].uri;

  return simplifiedAlbum;
};

SpotifyHelper.prototype.simplifyArtists = function( items ) {

  var artists = [];

  for (var i = 0 ; i < items.length ; i ++ ) {
    var artist = this.simplifyArtist( items[i] );
    artists.push( artist );
  }
  return artists;

}

SpotifyHelper.prototype.simplifyArtist = function( artist ) {

  var simplifiedArtist= {};
  simplifiedArtist.name = artist.name;
  simplifiedArtist.id = artist.uri;
  simplifiedArtist.image = ( artist.images.length != 0 ) ? artist.images[0].url : null;

  return simplifiedArtist;
};

SpotifyHelper.prototype.joinArtistNames = function( artists ) {
  
  var artistNames = [];
  for ( var i = 0 ; i < artists.length ; i ++ ) {
    artistNames.push(artists[i].name);
  }

  return artistNames.join(', ');
}

SpotifyHelper.prototype.refreshAccessToken = function(){

  var scope = this;
  this.spotifyApi.refreshAccessToken()
    .then(function(data) {
      console.log('The access token has been refreshed!');

      // Save the access token so that it's used in future calls
      scope.spotifyApi.setAccessToken(data.body['access_token']);

      //Refresh every 55 minutes.
      clearTimeout(scope.refreshTokenIntervalReference);
      scope.refreshTokenIntervalReference = setTimeout(function() {
		    scope.refreshAccessToken();
      },scope.refreshTokenTimeout);

    }, function(err) {
      scope.handleError('refreshAccessToken',err);
    });
}


SpotifyHelper.prototype.getAuthURL = function() {

  var scopes = ['user-read-private', 'user-read-email'],
      state = 'rockbox-state';

  // Create the authorization URL
  var authorizeURL = this.spotifyApi.createAuthorizeURL(scopes, state);
  return authorizeURL;

};

SpotifyHelper.prototype.handleAuthCallback = function(code) {
  var scope = this;

  this.spotifyApi.authorizationCodeGrant(code)
    .then(function(data) {
      console.log('The token expires in ' + data.body['expires_in']);
      console.log('The access token is ' + data.body['access_token']);
      console.log('The refresh token is ' + data.body['refresh_token']);

      storage.setItem('code',code);
      storage.setItem('access_token',data.body['access_token']);
      storage.setItem('refresh_token',data.body['refresh_token']);
      
      // Set the access token on the API object to use it in later calls
      scope.spotifyApi.setAccessToken(data.body['access_token']);
      scope.spotifyApi.setRefreshToken(data.body['refresh_token']);
    }, function(err) {
      console.log('Something went wrong!', err);
    });
};

SpotifyHelper.prototype.handleError = function(functionName, err) {
  console.error(functionName, err);

  if ( err.statusCode == 401 ) {
    this.refreshAccessToken();
  }

};