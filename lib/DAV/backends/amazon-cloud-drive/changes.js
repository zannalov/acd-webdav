'use strict';

var jsDAV_ACD_Changes = function jsDAV_ACD_Changes() { };

jsDAV_ACD_Changes.CHANGES_POLLING_DELAY = 1000;

jsDAV_ACD_Changes.prototype.tree = null;
jsDAV_ACD_Changes.prototype.acdCache = null;
jsDAV_ACD_Changes.prototype.enabled = false;
jsDAV_ACD_Changes.prototype.catchUp = false;

jsDAV_ACD_Changes.prototype._requestPending = false;
jsDAV_ACD_Changes.prototype._requestScheduled = false;

jsDAV_ACD_Changes.prototype.stopPolling = function() {
    this.enabled = false;
    this.clearSchedule();
};

jsDAV_ACD_Changes.prototype.clearSchedule = function() {
    if( null !== this._requestScheduled ) {
        clearTimeout( this._requestScheduled );
        this._requestScheduled = null;
    }
};

jsDAV_ACD_Changes.prototype.startPolling = function( catchUp ) {
    this.enabled = true;
    this.catchUp = Boolean( catchUp );

    this.acdCache.getCheckpoint( function( err , checkpoint ) {
        this._checkpoint = checkpoint;
        this._fetchNextPageOfChanges();
    }.bind( this ) );
};

jsDAV_ACD_Changes.prototype._fetchNextPageOfChanges = function() {
    if( !this.enabled || this._requestPending ) {
        return;
    }
    this._requestPending = true;

    this.clearSchedule();

    var requestOptions = {
        url: '/changes',
        method: 'POST',
        gzip: true,
    };

    if( this._checkpoint ) {
        requestOptions.body = JSON.stringify( {
            checkpoint: this._checkpoint,
        } );
    }

    var handleResponse = function( err , res , body ) {
        this._requestPending = false;

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

        if( 0 === body.nodes.length ) {
            this.catchUp = false;
        }

        this._checkpoint = body.checkpoint;

        this.acdCache.updateMetadata( body.nodes , body.checkpoint , scheduleNextCall );
    }.bind( this );

    var scheduleNextCall = function() {
        if( !this.enabled ) {
            return;
        }

        if( this.catchUp ) {
            return this._fetchNextPageOfChanges();
        }

        this._requestScheduled = setTimeout( function() {
            this._requestScheduled = null;
            this._fetchNextPageOfChanges();
        }.bind( this ) , this.pollingDelay || jsDAV_ACD_Changes.CHANGES_POLLING_DELAY );
    }.bind( this );

    this.tree.acdRequest( {
        endpointName: 'metadataUrl',
        requestOptions: requestOptions,
        directCallback: handleResponse,
        responseCallback: handleResponse,
    } );
};

module.exports = jsDAV_ACD_Changes;
