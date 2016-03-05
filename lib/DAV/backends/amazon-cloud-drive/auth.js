// This is simply a suite of tools for working with the Amazon auth service described here:
// https://developer.amazon.com/appsandservices/apis/experience/cloud-drive/content/restful-api-getting-started

var events = require( 'events' );
var querystring = require( 'querystring' );
var url = require( 'url' );
var request = require( 'request' );

// Constructor
function AmazonAuth( options ) {
    // Make sure it's an object
    options = options || {};

    // For convenience, extend self with options
    for( var k in options ) {
        this[ k ] = options[ k ];
    }

    return this;
}

// Make it an event emitter
AmazonAuth.prototype.__proto__ = events.EventEmitter.prototype;

// Constants
AmazonAuth.ENDPOINT_UPDATE_CACHE_TIME = ( 1000 * 60 * 60 * 24 * 5 );

// Configuration
AmazonAuth.prototype.client_id = null;
AmazonAuth.prototype.client_secret = null;
AmazonAuth.prototype.scope = null;
AmazonAuth.prototype.redirect_uri = null;

// Token object, ferried back from either Implicit Grant or Authorization Code Grant
// null if not received yet or Object
//  {
//      "token_type": "bearer",
//      "expires_in": 3600,
//      "scope": "clouddrive:read_all clouddrive:write", // only returned for Implicit Grant
//      "refresh_token": "Atzr|IQEBLzAtAhUAibmh-1N0EsdqwqwdqdasdvferrE", // only returned for Authorization Code Grant
//      "access_token": "Atza|IQEBLjAsAhRBejiZKPfn5HO2562GBt26qt23EA" // only returned for Authorization Code Grant
//  }
AmazonAuth.prototype.token = null;
AmazonAuth.prototype.tokenLastUpdated = null; // Use output from Date.now()

function guaranteeCallback( callback ) {
    if( 'function' === typeof callback ) {
        return callback;
    } else {
        return function(){};
    }
}

// Helper method for checking token expiration
AmazonAuth.prototype.getToken = function getToken( callback ) {
    // Sanity check, if there's no token object, there cannot be a token
    if( !this.token ) {
        setTimeout( function() {
            guaranteeCallback( callback )( new Error( 'no token object' ) , null );
        } , 1 );

        return;
    }

    // Sanity check, if we can't tell when it should have expired, assume it already has
    if( !this.token.expires_in || !this.tokenLastUpdated ) {
        setTimeout( function() {
            guaranteeCallback( callback )( new Error( 'error with expiration information' ) , null );
        } , 1 );

        return;
    }

    // If the token has expired or will expire within 30 seconds
    if( this.tokenLastUpdated + ( ( this.token.expires_in - 30 ) * 1000 ) < Date.now() ) {
        this.fetchTokenFromRefresh( callback );
        return null;
    }

    setTimeout( ( function() {
        guaranteeCallback( callback )( null , this.token );
    } ).bind( this ) , 1 );
};

// Helper method for setting token
AmazonAuth.prototype.setToken = function setToken( token ) {
    this.token = token;
    this.tokenLastUpdated = Date.now();
    this.emit( 'token' , token );
};

// Helper method for clearing token info
AmazonAuth.prototype.clearToken = function clearToken( callback ) {
    this.token = null;
    this.tokenLastUpdated = null;

    setTimeout( function() {
        guaranteeCallback( callback )( new Error( 'token cleared' ) , null );
    } , 1 );
};

// > ``https://drive.amazonaws.com/drive/v1/account/endpoint``
// > The response from the the Amazon Cloud Drive returns the following parameters, which are used in new requests.
// > * ``metadataUrl``: Specifies the URI for the read and write metadata of nodes
// > * ``contentUrl ``: Specifies the URI for uploading and downloading files
// > Note: The response to the getEndpoint request for each customer should be cached for three to five days. You should not send a getEndpoint method request daily.
AmazonAuth.prototype.endpoint = null; // null if not retrieved, otherwise returned object
AmazonAuth.prototype.endpointLastUpdated = null; // Use output from Date.now()

// Helper method for getting endpoint info
// Callback will receive endpoint object as first parameter or null if there is none
AmazonAuth.prototype.getEndpoint = function getEndpoint( callback ) {
    if( !this.endpoint || this.endpointLastUpdated + AmazonAuth.ENDPOINT_UPDATE_CACHE_TIME < Date.now() ) {
        // If no endpoint or endpoint has expired, fetch new
        this.fetchEndpoint( callback );
    } else {
        // else call with existing value asynchronously
        setTimeout( ( function() {
            guaranteeCallback( callback )( null , this.endpoint );
        } ).bind( this ) , 1 );
    }
};

// Helper method for setting endpoint info
AmazonAuth.prototype.setEndpoint = function setEndpoint( endpoint ) {
    this.endpoint = endpoint;
    this.endpointLastUpdated = Date.now();
    this.emit( 'endpoint' , endpoint );
};

// Helper method for clearing endpoint info
AmazonAuth.prototype.clearEndpoint = function clearEndpoint( callback ) {
    this.endpoint = null;
    this.endpointLastUpdated = null;

    setTimeout( function() {
        guaranteeCallback( callback )( new Error( 'endpoint cleared' ) , null );
    } , 1 );
};

// Fetch endpoint info
AmazonAuth.prototype.fetchEndpoint = function fetchEndpoint( callback ) {
    this.getHeadersForRequest( ( function( error , headers ) {
        if( error ) {
            return guaranteeCallback( callback )( error , null );
        }

        request( {
            url: 'https://drive.amazonaws.com/drive/v1/account/endpoint',
            headers: headers,
        } , ( function( error , res , body ) {
            try {
                body = JSON.parse( body );
            } catch ( e ) { }

            if( error || res.statusCode !== 200 || !body || !body.metadataUrl || !body.contentUrl ) {
                this.clearEndpoint( callback );
            } else {
                this.setEndpoint( body );
                this.getEndpoint( callback );
            }
        } ).bind( this ) );
    } ).bind( this ) );
};

// Generate the URL required for authorization
AmazonAuth.prototype.generateAuthUrl = function generateAuthUrl() {
    if( !this.client_id || !this.scope || !this.redirect_uri ) {
        return null;
    };

    var authUrlObject = {
        protocol: 'https',
        host: 'www.amazon.com',
        pathname: '/ap/oa',
        search: querystring.stringify( {
            client_id: this.client_id,
            scope: this.scope,
            response_type: (
                this.client_secret
                ? 'code'
                : 'token'
            ),
            redirect_uri: this.redirect_uri,
        } ),
    };

    return url.format( authUrlObject );
};

// Process object coming back from auth call
AmazonAuth.prototype.processTokenResponse = function processTokenResponse( obj , callback ) {
    if( !obj ) {
        this.clearToken( callback );
        return;
    }

    if( obj.code ) {
        this.fetchTokenFromCode( obj , callback );
        return;
    }

    if( !obj.access_token || !obj.expires_in ) {
        this.clearToken( callback );
        return;
    }

    this.setToken( obj );
    this.getToken( callback );
    this.getEndpoint();
};

AmazonAuth.prototype.fetchTokenFromCode = function fetchTokenFromCode( codeObj , callback ) {
    request.post( 'https://api.amazon.com/auth/o2/token' , {
        form: {
            grant_type: 'authorization_code',
            code: codeObj.code,
            client_id: this.client_id,
            client_secret: this.client_secret,
            redirect_uri: this.redirect_uri,
        },
    } , ( function( error , res , body ) {
        try {
            body = JSON.parse( body );
        } catch ( e ) { }

        if( error || res.statusCode !== 200 || !body || !body.access_token ) {
            this.clearToken( callback );
        } else {
            this.processTokenResponse( body , callback );
        }
    } ).bind( this ) );
};

AmazonAuth.prototype.fetchTokenFromRefresh = function fetchTokenFromRefresh( callback ) {
    request.post( 'https://api.amazon.com/auth/o2/token' , {
        form: {
            grant_type: 'refresh_token',
            refresh_token: this.token.refresh_token,
            client_id: this.client_id,
            client_secret: this.client_secret,
        },
    } , ( function( error , res , body ) {
        try {
            body = JSON.parse( body );
        } catch ( e ) { }

        if( error || res.statusCode !== 200 || !body || !body.access_token ) {
            this.clearToken( callback );
        } else {
            this.processTokenResponse( body , callback );
        }
    } ).bind( this ) );
};

// Helper method
AmazonAuth.prototype.getHeadersForRequest = function getHeadersForRequest( callback ) {
    this.getToken( function( error , token ) {
        if( !token ) {
            return guaranteeCallback( callback )( error , null );
        }

        guaranteeCallback( callback )( null , {
            'Authorization': 'Bearer ' + token.access_token,
        } );
    } );
};

// Export constructor
module.exports.AmazonAuth = AmazonAuth;
