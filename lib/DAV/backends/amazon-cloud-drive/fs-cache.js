'use strict';

var fs = require( 'fs' );

var sanitize = require( 'sanitize-filename' );

var jsDAV_ACD_Util = require( './util' );

var JSDAV = require( 'jsDAV/lib/jsdav' );
var Util = require( 'jsDAV/lib/shared/util' );

/* Usage
try {
    var acdCache = new jsDAV_ACD_Fs_Cache( '/tmp' );
} catch( e ) {
    ...
}
acdCache.getMetadataFromId( id , callback ); // callback( err , metadata )
acdCache.getCheckpoint( callback ); // callback( err , checkpoint )
acdCache.updateMetadata( metadata_or_array_of_metadata , callback ); // callback( null_or_error_or_errors_array )
acdCache.updateMetadata( metadata_or_array_of_metadata , newCheckpoint , callback ); // callback( null_or_error_or_errors_array )
*/

var jsDAV_ACD_Fs_Cache = function jsDAV_ACD_Fs_Cache( storageDir ) {
    this.storageDir = String( storageDir ).replace( /\/+$/ , '' );

    // These are done synchronously up-front so we can throw an error on
    // instantiation if we're unable to create our required directories
    jsDAV_ACD_Fs_Cache._safeMkdirSync( this.storageDir );
    jsDAV_ACD_Fs_Cache._safeMkdirSync( this.storageDir + '/metadata' );
};

jsDAV_ACD_Fs_Cache._safeMkdirSync = function _safeMkdirSync( path ) {
    var stat;
    var err;

    try {
        stat = fs.statSync( path );
    } catch( e ) {
        err = e;
    }

    if( !err && !stat.isDirectory() ) {
        throw new Error( path + ' exists but is not a directory' );
    }

    if( err ) {
        fs.mkdirSync( path );
    }
};

jsDAV_ACD_Fs_Cache.prototype._getJsonFile = function _getJsonFile( subPath , callback ) {
    var fileName = this.storageDir + subPath;
    fs.readFile( fileName , function( err , data ) {
        if( err ) {
            if( JSDAV.debugMode ) {
                Util.log( 'Error fetching ' + fileName );
            }

            callback( err , null );
        } else {
            try {
                data = JSON.parse( data );

                if( JSDAV.debugMode ) {
                    Util.log( 'Successfully fetched ' + fileName );
                }

                callback( null , data );
            } catch( e ) {
                if( JSDAV.debugMode ) {
                    Util.log( 'Error deconding ' + fileName );
                }

                callback( e , null );
            }
        }
    } );
};

jsDAV_ACD_Fs_Cache.prototype._saveJsonFile = function _saveJsonFile( subPath , data , callback ) {
    var fileName = this.storageDir + subPath;
    fs.writeFile( fileName , JSON.stringify( data ) , function( err ) {
        if( JSDAV.debugMode ) {
            if( err ) {
                Util.log( 'Error writing ' + fileName );
            } else {
                Util.log( 'Successfully wrote ' + fileName );
            }
        }

        callback.apply( this , arguments );
    } );
};

jsDAV_ACD_Fs_Cache.prototype._deleteFile = function _deleteFile( subPath , callback ) {
    var fileName = this.storageDir + subPath;
    fs.unlink( fileName , function( err ) {
        if( err && 'ENOENT' === err.code ) {
            err = null;
        }

        if( JSDAV.debugMode ) {
            if( err ) {
                Util.log( 'Error removing ' + fileName );
            } else {
                Util.log( 'Successfully deleted ' + fileName );
            }

            callback( err );
        }
    } );
};

jsDAV_ACD_Fs_Cache._metadataSubPathForId = function _metadataSubPathForId( id ) {
    return '/metadata/' + sanitize( id , { replacement: '_' } ).substr( 0 , 250 ) + '.json';
};

jsDAV_ACD_Fs_Cache.prototype.getMetadataFromId = function getMetadataFromId( id , callback ) {
    this._getJsonFile( jsDAV_ACD_Fs_Cache._metadataSubPathForId( id ) , callback );
};

jsDAV_ACD_Fs_Cache.prototype._saveMetadata = function _saveMetadata( metadata , callback ) {
    this._saveJsonFile( jsDAV_ACD_Fs_Cache._metadataSubPathForId( metadata.id ) , metadata , callback );
};

jsDAV_ACD_Fs_Cache.prototype._removeId = function _removeId( id , callback ) {
    this._deleteFile( jsDAV_ACD_Fs_Cache._metadataSubPathForId( id ) , callback );
};

jsDAV_ACD_Fs_Cache.prototype.getCheckpoint = function getCheckpoint( callback ) {
    this._getJsonFile( '/checkpoint.json' , callback );
};

// updateMetadata(mdata, callback)
// updateMetadata(mdata, checkpoint, callback)
// mdata = metadata_object || array_of_metadata_objects
jsDAV_ACD_Fs_Cache.prototype.updateMetadata = function updateMetadata( mdata , checkpoint , callback ) {
    // Sanitize inputs
    if( !Array.isArray( mdata ) ) {
        mdata = [ mdata ];
    }
    if( Object.prototype.toString.call( checkpoint ) === '[object Function]' ) {
        callback = checkpoint;
        checkpoint = null;
    }

    // Generic mechanism for recording any/all errors during file writes
    var errors = [];
    var createRecordErrorsThenNextCallback = function( callback ) {
        return function( err ) {
            if( Array.isArray( err ) ) {
                errors = errors.concat( err );
            } else if( err ) {
                errors.push( err );
            }

            callback.apply( this , arguments );
        };
    };

    // Process checkpoint last
    var updateCheckpoint = function() {
        // If no checkpoint was provided or errors were encountered updating
        // data, then don't store the new checkpoint.
        if( !checkpoint || errors.length ) {
            return complete();
        }

        this._saveJsonFile( '/checkpoint.json' , checkpoint , createRecordErrorsThenNextCallback( complete ) );
    }.bind( this );

    // When all complete, call the callback
    var complete = function() {
        callback( errors.length ? errors : null );
    }.bind( this );

    // Process metadata objects first
    jsDAV_ACD_Util.asyncShift( mdata , function( metadata , asyncShiftCallback ) {
        this._updateMetadata( metadata , createRecordErrorsThenNextCallback( asyncShiftCallback ) );
    }.bind( this ) , updateCheckpoint );
};

jsDAV_ACD_Fs_Cache.prototype._updateMetadata = function _updateMetadata( metadata , _updateMetadataCallback ) {
    if( Object.prototype.toString.call( metadata ) === '[object String]' ) {
        try {
            metadata = JSON.parse( metadata );
        } catch ( e ) {
            _updateMetadataCallback( e );
        }
    }

    metadata.parents = metadata.parents || [];

    this._modifyCachedData( metadata.id , function( err , cachedMetadata , metadataModificationCompleteCallback ) {
        // Ensure cachedMetadata object fits our needs, ignore load errors
        cachedMetadata = cachedMetadata || {};
        cachedMetadata.parents = cachedMetadata.parents || [];
        cachedMetadata.children = cachedMetadata.children || {}; // { id: name } to allow lookups of children by name

        // Inherit the list of children from the old cache, because to update
        // this would require a new fetch from the server (or a large,
        // unindexed search of these cache files). ACD only provides the list
        // of parents, not the list of children, so normally this will inherit.
        metadata.children = metadata.children || cachedMetadata.children;

        // Helper variables for processing the lists of parents
        var arrayIndex;
        var currentParents = 'TRASH' === metadata.status ? [] : metadata.parents;
        var originalParents = cachedMetadata.parents;

        // Find all parents which were removed from the node
        var removedParents = [];
        for( arrayIndex = originalParents.length - 1 ; arrayIndex >= 0 ; -- arrayIndex ) {
            if( -1 === currentParents.indexOf( originalParents[ arrayIndex ] ) ) {
                removedParents.push( originalParents[ arrayIndex ] );
            }
        }

        // Find all parents which were added to the node
        var addedParents = [];
        for( arrayIndex = currentParents.length - 1 ; arrayIndex >= 0 ; -- arrayIndex ) {
            if( -1 === originalParents.indexOf( currentParents[ arrayIndex ] ) ) {
                addedParents.push( currentParents[ arrayIndex ] );
            }
        }

        // All errors from any step of the process
        var errors = [];

        // Generic method for modifying the list of children on one of the
        // parents of this node
        var changeParentsChildrenList = function( parentList , modificationCallback , nextStep ) {
            jsDAV_ACD_Util.asyncShift( parentList , function( parentId , asyncShiftCallback ) {
                this._modifyCachedData( parentId , function( err , parentMetadata , parentModificationCompleteCallback ) {
                    if( err ) {
                        errors.push( new Error( 'unable to update children links for metadata.id ' + parentId ) );
                        parentModificationCompleteCallback( err );
                        return;
                    }

                    parentMetadata.children = parentMetadata.children || [];
                    modificationCallback( parentMetadata.children );

                    parentModificationCompleteCallback( null , parentMetadata );
                } , asyncShiftCallback );
            }.bind( this ) , nextStep );
        }.bind( this );

        // Method for removing this node from the list of children on parents
        // which are no longer listed on this node. In other words...
        //
        // With this update, [This Node] --x--> [Parent Node]
        //
        // So we want to also update: [Parent Node] --x--> [This Node]
        var processRemovedParents = function( next ) {
            changeParentsChildrenList( removedParents , function( children ) {
                delete children[ metadata.id ];
            } , next );
        };

        // Method for adding this node to the list of children on parents who
        // didn't previously list this node. In other words...
        //
        // With this update, [This Node] --+--> [Parent Node]
        //
        // So we want to also update: [Parent Node] --+--> [This Node]
        var processAddedParents = function( next ) {
            changeParentsChildrenList( addedParents , function( children ) {
                children[ metadata.id ] = metadata.name;
            } , next );
        };

        // Now that the parents have been updated, we can safely store the new
        // metadata
        var recordChanges = function() {
            metadataModificationCompleteCallback( errors.length ? errors : null , metadata );
        };

        // Start with the removed nodes, then take care of the added nodes,
        // then store this node
        processRemovedParents( processAddedParents.bind( null , recordChanges ) );
    }.bind( this ) , _updateMetadataCallback );
};

// _modifyCachedData fetches the cached node
// Passes result of fetch to modificationCallback along with a modificationCompleteCallback, so modificationCallback( err , metadata , modificationCompleteCallback )
// modificationCallback performs modifications
// modificationCallback calls modificationCompleteCallback( err , updatedValue )
// modificationCompleteCallback skips _saveMetadata if err modifying and calls finalCallback( err )
// modificationCompleteCallback calls _saveMetadata
// _saveMetadata calls finalCallback
jsDAV_ACD_Fs_Cache.prototype._modifyCachedData = function _modifyCachedData( id , modificationCallback , finalCallback ) {
    this.getMetadataFromId( id , function( err , metadata ) {
        modificationCallback( err , metadata , function modificationCompleteCallback( err , modifiedMetadata ) {
            if( err ) {
                return finalCallback( err );
            }

            if( metadata && 'TRASH' === modifiedMetadata.status ) {
                this._removeId( modifiedMetadata.id , finalCallback );
            } else {
                this._saveMetadata( modifiedMetadata , finalCallback );
            }
        }.bind( this ) );
    }.bind( this ) );
};

module.exports = jsDAV_ACD_Fs_Cache;
