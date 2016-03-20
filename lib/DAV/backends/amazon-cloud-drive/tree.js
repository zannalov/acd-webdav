'use strict';

var jsDAV_Tree = require( 'jsDAV/lib/DAV/tree' );
var jsDAV_ACD_Directory = require( './directory' );
var jsDAV_ACD_File = require( './file' );
var jsDAV_ACD_Util = require( './util' );
var jsDAV_ACD_Fs_Cache = require( './fs-cache' );

var JSDAV = require( 'jsDAV/lib/jsdav' );
var jsDAV_Server = require( 'jsDAV/lib/DAV/server' );
var Exc = require( 'jsDAV/lib/shared/exceptions' );
var Util = require( 'jsDAV/lib/shared/util' );

var CHANGES_POLLING_DELAY = 1000;

var jsDAV_ACD_Tree = jsDAV_Tree.extend( {
    rootNodeId: null,

    initialize: function( options ) {
        this.options = options;
        this.amazonAuth = options.amazonAuth;
        this.basePath = '/' + Util.trim( options.path || '' , '/' );

        if( options.acdCache ) {
            this.acdCache = options.acdCache;
        } else {
            this.acdCache = new jsDAV_ACD_Fs_Cache( options.tmpDir || jsDAV_Server.DEFAULT_TMPDIR );
        }

        //this.startPollingChanges( true );
    },

    acdRequest: function( opts ) {
        opts.amazonAuth = this.amazonAuth;
        return jsDAV_ACD_Util.acdRequest( opts );
    },

    changesRouteEnabled: false,
    changesCatchUp: false,
    changesCheckpoint: null,
    changesRequestPending: false,
    changesRequestScheduled: null,

    stopPollingChanges: function() {
        this.changesRouteEnabled = false;
        this.clearChangesPollingSchedule();
    },

    clearChangesPollingSchedule: function() {
        if( null !== this.changesRequestScheduled ) {
            clearTimeout( this.changesRequestScheduled );
            this.changesRequestScheduled = null;
        }
    },

    startPollingChanges: function( catchUp ) {
        this.getNodeForPath( '/' , function() {
            this.changesRouteEnabled = true;
            this.changesCatchUp = Boolean( catchUp );
            this._fetchNextPageOfChanges();
        }.bind( this ) );
    },

    _fetchNextPageOfChanges: function() {
        if( this.changesRequestPending ) {
            return;
        }
        this.changesRequestPending = true;

        this.clearChangesPollingSchedule();

        var requestOptions = {
            url: '/changes',
            method: 'POST',
            gzip: true,
        };

        if( this.changesCheckpoint ) {
            requestOptions.body = JSON.stringify( {
                checkpoint: this.changesCheckpoint,
            } );
        }

        var handleResponse = function( err , res , body ) {
            this.changesRequestPending = false;

            if( err || !res || 200 !== res.statusCode ) {
                return scheduleNextCall();
            }

            try {
                body = JSON.parse( body.substring( 0 , body.indexOf( '\n' ) ) );
            } catch( e ) {
                return scheduleNextCall();
            }

            if( !body.nodes || !body.checkpoint ) {
                return scheduleNextCall();
            }

            /*
            body.nodes.forEach( function( nodeUpdate ) {
                TODO: cache
            }.bind( this ) );
            */

            if( 0 === body.nodes.length ) {
                this.changesCatchUp = false;
            }

            this.changesCheckpoint = body.checkpoint;

            scheduleNextCall();
        }.bind( this );

        var scheduleNextCall = function() {
            if( !this.changesRouteEnabled ) {
                return;
            }

            if( this.changesCatchUp ) {
                return this._fetchNextPageOfChanges();
            }

            this.changesRequestScheduled = setTimeout( function() {
                this.changesRequestScheduled = null;
                this._fetchNextPageOfChanges();
            }.bind( this ) , CHANGES_POLLING_DELAY );
        }.bind( this );

        this.acdRequest( {
            endpointName: 'metadataUrl',
            requestOptions: requestOptions,
            directCallback: handleResponse,
            responseCallback: handleResponse,
        } );
    },

    // Returns a new node for the given path
    getNodeForPath: function( requestedPath , cbacdgnfp ) {
        var realPath = this.getRealPath( requestedPath );
        if ( ! this.insideSandbox( realPath ) ) {
            var nicePath = this.stripSandbox( realPath );
            return cbacdgnfp( new Exc.Forbidden( 'You are not allowed to access ' + nicePath ) );
        }

        this._getNodeForPath( realPath.split( '/' ) , cbacdgnfp , null );
    },

    _initNode: function( realPath , metadata ) {
        var node = null;

        if( JSDAV.debugMode ) {
            Util.log( '_initNode' , realPath , metadata );
        }

        if( 'FOLDER' === metadata.kind ) {
            node = jsDAV_ACD_Directory.new( this , realPath , metadata );
        } else if( 'FILE' === metadata.kind ) {
            node = jsDAV_ACD_File.new( this , realPath , metadata );
        }

        return node;
    },

    _turnMetadataIntoNodeAndCache: function( realPath , metadata , callback ) {
        var nicePath = this.stripSandbox( realPath );

        this.acdCache.updateMetadata( metadata , function() {
            var node = this._initNode( realPath , metadata );
            if( !node ) {
                callback( new Exc.UnsupportedMediaType( 'Path ' + nicePath + ' is an unsupported media type' ) );
                return;
            }

            callback( null , node );
        }.bind( this ) );
    },

    _getNodeById: function( realPath , id , callback ) {
        this._getNodeMetadataById( id , function( err , metadata ) {
            if( err ) {
                return callback( err );
            }

            this._turnMetadataIntoNodeAndCache( realPath , metadata , function( err , node ) {
                if( err ) {
                    return callback( err );
                }

                callback( null , node );
            } );
        }.bind( this ) );
    },

    _getNodeMetadataById: function( id , callback ) {
        this.acdCache.getMetadataFromId( id , function( err , metadata ) {
            if( !err && metadata ) {
                callback( null , metadata );
            } else {
                this._fetchNodeMetadataById( id , function( err , metadata ) {
                    callback( err , metadata );
                } );
            }
        }.bind( this ) );
    },

    _getNodeForPath: function( pathChunks , cbacdgnfp , parentNode ) {
        var nextPathChunk = pathChunks.shift();
        var realPath = this.cleanupPath( ( parentNode && parentNode.realPath || '' ) + '/' + nextPathChunk );
        var node = null;

        var processNode = function() {
            if( !parentNode ) {
                this.rootNodeId = node.metadata.id;
            }

            if( pathChunks.length ) {
                this._getNodeForPath( pathChunks , cbacdgnfp , node );
            } else {
                cbacdgnfp( null , node );
            }
        }.bind( this );

        var processMetadata = function( err , metadata ) {
            if( err ) {
                return cbacdgnfp( err );
            }

            this._turnMetadataIntoNodeAndCache( realPath , metadata , function( err , newNode ) {
                node = newNode;
                processNode();
            } );
        }.bind( this );

        var handleNodeById = function( id ) {
            this._getNodeMetadataById( id , processMetadata );
        }.bind( this );

        if( !parentNode && this.rootNodeId ) {
            return handleNodeById( this.rootNodeId );
        }

        if( parentNode && parentNode.metadata.children ) {
            for( var id in parentNode.metadata.children ) {
                if( parentNode.metadata.children[ id ] === nextPathChunk ) {
                    return handleNodeById( id );
                }
            }
        }

        this._fetchChildNodeMetadataByName( nextPathChunk , parentNode && parentNode.metadata.id || null , processMetadata );
    },

    _fetchNodeMetadataById: function( id , cbacdfnmbi ) {
        this.acdRequest( {
            endpointName: 'metadataUrl',
            requestOptions: {
                url: '/nodes/' + id,
            },
            directCallback: cbacdfnmbi,
            responseCallback: function( error , res , body ) {
                if( error ) {
                    cbacdfnmbi( new Exc.jsDAV_Exception( 'Error while fetching node ' + id ) );
                    return;
                }

                if( 200 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error fetching node ' + id );
                    exc.code = res.statusCode;
                    cbacdfnmbi( exc );
                    return;
                }

                try {
                    body = JSON.parse( body );
                } catch( e ) {
                    cbacdfnmbi( new Exc.jsDAV_Exception( 'Error decoding response from ACD for node ' + id ) );
                    return;
                }

                cbacdfnmbi( null , body );
            }.bind( this ),
        } );
    },

    _fetchChildNodeMetadataByName: function( name , parentNodeId , callback ) {
        var filters = [
            'kind:(FILE AND FOLDER)',
            'status:AVAILABLE',
        ];

        if( !parentNodeId ) {
            filters.push( 'isRoot:true' );
        } else {
            filters.push( 'parents:' + parentNodeId );
            filters.push( 'name:' + name );
        }

        filters = 'filters=' + encodeURIComponent( filters.join( ' AND ' ) );

        this.acdRequest( {
            endpointName: 'metadataUrl',
            requestOptions: {
                url: '/nodes?' + filters,
            },
            directCallback: callback,
            responseCallback: function( error , res , body ) {
                if( error ) {
                    callback( new Exc.jsDAV_Exception( 'Error while fetching ' + name + ' within node ' + parentNodeId ) );
                    return;
                }

                if( 200 !== res.statusCode ) {
                    var exc = new Exc.jsDAV_Exception( 'Error fetching ' + name + ' within node ' + parentNodeId );
                    exc.code = res.statusCode;
                    callback( exc );
                    return;
                }

                try {
                    body = JSON.parse( body );
                } catch( e ) {
                    callback( new Exc.jsDAV_Exception( 'Error decoding response from ACD for ' + name + ' within node ' + parentNodeId ) );
                    return;
                }

                if( 1 !== body.count ) {
                    callback( new Exc.FileNotFound( 'File ' + name + ' within node ' + parentNodeId + ' not found' ) );
                    return;
                }

                callback( null , body.data[ 0 ] );
            }.bind( this ),
        } );
    },

    getDirFromPath: function( path ) {
        var dir = Util.splitPath( path )[ 0 ];
        if( dir === path ) {
            dir = '/';
        }

        return dir;
    },

    getFileFromPath: function( path ) {
        var file = Util.splitPath( path )[ 1 ];
        if( !file ) {
            file = path;
        }

        return file;
    },

    // Will always start with a '/' unless the full path is '/'.
    // Will never end with a '/'.
    cleanupPath: function( path ) {
        return ( '/' + path ).replace( /\/+/g , '/' ).replace( /\/$/ , '' );
    },

    // Returns the full path within ACD (in case we are mounted on a sub-directory).
    getRealPath: function( publicPath ) {
        return this.cleanupPath( this.basePath + '/' + publicPath );
    },

    copy: function( sourcePath , destinationPath , cbacdcopy ) {
        var destinationDirPath = this.getDirFromPath( destinationPath );
        var destinationFileName = this.getFileFromPath( destinationPath );

        this.getNodeForPath( sourcePath , ( function( err , sourceNode ) {
            if( err ) {
                return cbacdcopy( new Exc.jsDAV_Exception( 'Error while fetching ' + sourcePath + ' metadata to copy to ' + destinationPath ) );
            }

            sourceNode.get( ( function( err , body ) {
                if( err ) {
                    return cbacdcopy( new Exc.jsDAV_Exception( 'Error while fetching ' + sourcePath + ' to copy to ' + destinationPath ) );
                }

                this.getNodeForPath( destinationDirPath , ( function( err , destinationDirNode ) {
                    if( err ) {
                        return cbacdcopy( new Exc.jsDAV_Exception( 'Error while fetching metadata for ' + destinationDirPath ) );
                    }

                    destinationDirNode.createFile( destinationFileName , body , 'binary' , cbacdcopy );
                } ).bind( this ) );
            } ).bind( this ) );
        } ).bind( this ) );
    },

    move: function( sourcePath , destinationPath , cbacdmove ) {
        var sourceDirPath = this.getDirFromPath( sourcePath );
        var destinationDirPath = this.getDirFromPath( destinationPath );

        var sourceNode = null;
        var sourceDirNode = null;
        var destinationDirNode = null;

        var afterSourceNode = function( err , node ) {
            if( err ) {
                return cbacdmove( err );
            }

            if( sourceDirPath === destinationDirPath ) {
                return node.setName( destinationPath , cbacdmove );
            }

            sourceNode = node;
            this.getNodeForPath( sourceDirPath , afterSourceDirNode );
            this.getNodeForPath( destinationDirPath , afterDestinationDirNode );
        }.bind( this );

        var afterSourceDirNode = function( err , node ) {
            if( err ) {
                return cbacdmove( err );
            }

            sourceDirNode = node;

            afterAllLoaded();
        }.bind( this );

        var afterDestinationDirNode = function( err , node ) {
            if( err ) {
                return cbacdmove( err );
            }

            destinationDirNode = node;

            afterAllLoaded();
        }.bind( this );

        var afterAllLoaded = function() {
            if(
                null === sourceNode ||
                null === sourceDirNode ||
                null === destinationDirNode
            ) {
                return;
            }

            this.acdRequest( {
                endpointName: 'metadataUrl',
                requestOptions: {
                    url: '/nodes/' + destinationDirNode.metadata.id + '/children',
                    method: 'POST',
                    json: true,
                    body: {
                        fromParent: sourceDirNode.metadata.id,
                        childId: sourceNode.metadata.id,
                    },
                },
                directCallback: cbacdmove,
                responseCallback: function( error , res /* , body */ ) {
                    if( error ) {
                        cbacdmove( new Exc.jsDAV_Exception( 'Error while moving ' + sourcePath + ' to ' + destinationPath ) );
                        return;
                    }

                    if( 200 !== res.statusCode ) {
                        var exc = new Exc.jsDAV_Exception( 'Error moving ' + sourcePath + ' to ' + destinationPath );
                        exc.code = res.statusCode;
                        cbacdmove( exc );
                        return;
                    }

                    this._fetchNodeMetadataById( sourceNode.metadata.id , function( err , metadata ) {
                        function done() {
                            cbacdmove( null );
                        }

                        if( !err ) {
                            this.acdCache.updateMetadata( metadata , done );
                        } else {
                            done();
                        }
                    } );
                }.bind( this ),
            } );
        }.bind( this );

        this.getNodeForPath( sourcePath , afterSourceNode );
    },
} );

module.exports = jsDAV_ACD_Tree;
