module.exports = SpotifyHelper;

var events = require('events');
//var storage = require('node-persist');
var SpotifyWebApi = require('spotify-web-api-node');
var encrpytion = require('./encryption.js');
var pg = require('pg');
pg.defaults.ssl = true;


/**
	Constructor.
*/
function SpotifyHelper() {

    events.EventEmitter.call(this);
	
	this.refreshTokenIntervalReference = undefined;
	this.refreshTokenTimeout = 1000 * 60 * 55; //Every 55 minutes.
//  this.refreshTokenTimeout = 1000 * 60; //Every 55 minutes.

	// credentials are optional
	this.spotifyApi = new SpotifyWebApi({
	  clientId : process.env.CLIENT_ID,
	  clientSecret : process.env.CLIENT_SECRET,
	  redirectUri : process.env.REDIRECT_URI
	});

  this.authString = new Buffer(process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET).toString('base64');
  this.authorizationHeader = 'Basic ' + this.authString;
  this.spotifyEndpoint = 'https://accounts.spotify.com/api/token';

  var scope = this;
  
  pg.connect(process.env.DATABASE_URL, function(err, client) {
    if (err) throw err;
    console.log('Connected to postgres! Getting schemas...');

    client
      .query('SELECT table_schema,table_name FROM information_schema.tables;')
      .on('row', function(row) {
        console.log(JSON.stringify(row));
      });
        scope.init();

  });

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
  console.log('init!');
	this.spotifyApi.setRefreshToken(redisClient.get('refresh_token'));
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

      redisClient.set('code',code);
      redisClient.set('access_token',data.body['access_token']);
      redisClient.set('refresh_token',data.body['refresh_token']);
      
      // Set the access token on the API object to use it in later calls
      scope.spotifyApi.setAccessToken(data.body['access_token']);
      scope.spotifyApi.setRefreshToken(data.body['refresh_token']);

      clearTimeout(scope.refreshTokenIntervalReference);
      scope.refreshTokenIntervalReference = setTimeout(function() {
        scope.refreshAccessToken();
      },scope.refreshTokenTimeout);

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

/**
 * Swap endpoint
 *
 * Uses an authentication code on req.body to request access and
 * refresh tokens. Refresh token is encrypted for safe storage.
 */
//app.post('/swap', function (req, res, next) {
SpotifyHelper.prototype.swapClientToken = function(req, res, next) {
    var formData = {
            grant_type : 'authorization_code',
            redirect_uri : process.env.CALLBACK_URI,
            code : req.body.code
        },
        options = {
            uri : url.parse(this.spotifyEndpoint),
            headers : {
                'Authorization' : this.authorizationHeader
            },
            form : formData,
            method : 'POST',
            json : true
        };

    request(options, function (error, response, body) {
        if (response.statusCode === 200) {
            body.refresh_token = encrpytion.encrypt(body.refresh_token);
        }
        
        res.status(response.statusCode);
        res.json(body);

        next();
    });
};

/**
 * Refresh endpoint
 *
 * Uses the encrypted token on request body to get a new access token.
 * If spotify returns a new refresh token, this is encrypted and sent
 * to the client, too.
 */
SpotifyHelper.prototype.refreshClientToken = function(req, res, next) {
//app.post('/refresh', function (req, res, next) {
    if (!req.body.refresh_token) {
        res.status(400).json({ error : 'Refresh token is missing from body' });
        return;
    }

    var refreshToken = encrpytion.decrypt(req.body.refresh_token),
        formData = {
            grant_type : 'refresh_token',
            refresh_token : refreshToken
        },
        options = {
            uri : url.parse(spotifyEndpoint),
            headers : {
                'Authorization' : this.authorizationHeader
            },
            form : formData,
            method : 'POST',
            json : true
        };

    request(options, function (error, response, body) {
        if (response.statusCode === 200 && !!body.refresh_token) {
            body.refresh_token = encrpytion.encrypt(body.refresh_token);
        }

        res.status(response.statusCode);
        res.json(body);

        next();
    });
};