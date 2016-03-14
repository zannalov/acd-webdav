'use strict';

var jsDAV_Tree = require( 'jsDAV/lib/DAV/tree' );
var jsDAV_ACD_Directory = require( './directory' );
var jsDAV_ACD_File = require( './file' );
var jsDAV_ACD_Util = require( './util' );

var path = require( 'path' );

var Exc = require( 'jsDAV/lib/shared/exceptions' );
var Util = require( 'jsDAV/lib/shared/util' );

var CHANGES_POLLING_DELAY = 1000;

var jsDAV_ACD_Tree = jsDAV_Tree.extend( {
    cachedNodesByRealPath: null, // realPath: node
    cachedNodesById: null, // id: node

    initialize: function( options ) {
        this.options = options;
        this.amazonAuth = options.amazonAuth;
        this.basePath = '/' + Util.trim( options.path || '' , '/' );
        this.cachedNodesByRealPath = {};
        this.cachedNodesById = {};
        this.startPollingChanges( true );
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

            body.nodes.forEach( function( nodeUpdate ) {
                ( nodeUpdate.parents || [] ).forEach( function( parentId ) {
                    if( this.cachedNodesById[ parentId ] ) {
                        this._initNode( this.cachedNodesById[ parentId ].realPath + '/' + nodeUpdate.name , nodeUpdate );
                    }
                }.bind( this ) );
            }.bind( this ) );

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

        jsDAV_ACD_Util.acdRequest( this.amazonAuth , 'metadataUrl' , requestOptions , handleResponse , handleResponse );
    },

    // Returns a new node for the given path
    getNodeForPath: function( requestedPath , cbacdgnfp ) {
        var realPath = this.getRealPath( requestedPath );
        if ( ! this.insideSandbox( realPath ) ) {
            var nicePath = this.stripSandbox( realPath );
            return cbacdgnfp( new Exc.Forbidden( 'You are not allowed to access ' + nicePath ) );
        }

        if( this.cachedNodesByRealPath[ realPath ] ) {
            return cbacdgnfp( null , this.cachedNodesByRealPath[ realPath ] );
        }

        this._getNodeForPath( realPath , cbacdgnfp , null );
    },

    _initNode: function( realPath , metadata ) {
        var node = null;

        if( 'FOLDER' === metadata.kind ) {
            node = jsDAV_ACD_Directory.new( this , realPath , metadata );
        } else if( 'FILE' === metadata.kind ) {
            node = jsDAV_ACD_File.new( this , realPath , metadata );
        }

        if( node ) {
            this.cachedNodesByRealPath[ realPath ] = node;
            this.cachedNodesById[ metadata.id ] = node;
        }

        return node;
    },

    // Returns a new node for the given path, drilling down from the root folder of ACD
    _getNodeForPath: function( realPathRemaining , cbacdgnfp , parentNode ) {
        var pathChunks = realPathRemaining.split( '/' );
        var nextPathChunk = pathChunks.shift();
        var realPath = ( '/' + ( parentNode && parentNode.realPath || '' ) + '/' + nextPathChunk ).replace( /\/+/g , '/' );

        var nicePath = this.stripSandbox( realPath );
        var node = this.cachedNodesByRealPath[ realPath ];

        var processNode = function() {
            if( pathChunks.length ) {
                this._getNodeForPath( pathChunks.join( '/' ) , cbacdgnfp , node );
            } else {
                cbacdgnfp( null , node );
            }
        }.bind( this );

        if( node ) {
            return processNode();
        }

        var filters = [
            'kind:(FILE AND FOLDER)',
            'status:AVAILABLE',
        ];

        if( !parentNode ) {
            filters.push( 'isRoot:true' );
        } else {
            filters.push( 'parents:' + parentNode.metadata.id );
            filters.push( 'name:' + nextPathChunk );
        }

        filters = 'filters=' + encodeURIComponent( filters.join( ' AND ' ) );

        jsDAV_ACD_Util.acdRequest( this.amazonAuth , 'metadataUrl' , { url: '/nodes?' + filters } , cbacdgnfp , ( function( error , res , body ) {
            if( error ) {
                cbacdgnfp( new Exc.jsDAV_Exception( 'Error while fetching ' + nicePath ) );
                return;
            }

            if( 200 !== res.statusCode ) {
                var exc = new Exc.jsDAV_Exception( 'Error fetching ' + nicePath );
                exc.code = res.statusCode;
                cbacdgnfp( exc );
                return;
            }

            try {
                body = JSON.parse( body );
            } catch( e ) {
                cbacdgnfp( new Exc.jsDAV_Exception( 'Error decoding response from ACD for ' + nicePath ) );
                return;
            }

            if( 1 !== body.count ) {
                cbacdgnfp( new Exc.FileNotFound( 'File ' + nicePath + ' not found' ) );
                return;
            }

            var metadata = body.data[ 0 ];

            node = this._initNode( realPath , metadata );
            if( !node ) {
                cbacdgnfp( new Exc.UnsupportedMediaType( 'Path ' + nicePath + ' is an unsupported media type' ) );
                return;
            }

            processNode();
        } ).bind( this ) );
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

    // Returns the full path within ACD (in case we are mounted on a sub-directory)
    getRealPath: function( publicPath ) {
        return '/' + path.join( this.basePath , publicPath ).replace( /\/+/g , '/' ).replace( /\/$/ , '' );
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
                        return cbacdcopy( new Exc.jsDAV_Exception( 'Error while fetching metadata for ' + destinationPath ) );
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

            var requestOptions = {
                url: '/nodes/' + destinationDirNode.metadata.id + '/children',
                method: 'POST',
                json: true,
                body: {
                    fromParent: sourceDirNode.metadata.id,
                    childId: sourceNode.metadata.id,
                },
            };

            jsDAV_ACD_Util.acdRequest( this.amazonAuth , 'metadataUrl' , requestOptions , cbacdmove , function( error , res /* , body */ ) {
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

                cbacdmove( null );
            }.bind( this ) );
        }.bind( this );

        this.getNodeForPath( sourcePath , afterSourceNode );
    },
} );

module.exports = jsDAV_ACD_Tree;
