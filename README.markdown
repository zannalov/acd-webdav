# Purpose #

This package provides a WebDAV interface for Amazon Cloud Drive.

# Usage #

TODO - run as app
TODO - jsDAV style interface

# Why #

[NodeJS](https://nodejs.org/) can be easily installed by most users on most computers. This allows us to focus on the goal without getting lost in the weeds of making something cross-system compatible.

[WebDAV](http://www.webdav.org/) is natively supported on most operating systems. [FUSE](http://fuse.sourceforge.net/) is only natively supported in Linux. This should be mountable as a local file-path **without requiring file synchronization**.

With only slight modification (allowing access to non-localhost interface), this can also be run on a home network to share a cloud drive.

# App Configuration #

First install the dev dependencies:

```bash
~/acd-webdav$ npm install
```

Then edit the ``config/default.js`` file (see the ``config/example.js`` file for all options).

Quick reference:

Config module variable          | Environment variable  | Default value                             | Description
----------------------          | --------------------  | -------------                             | -----------
``hostname``                    | ``HOSTNAME``          | ``'localhost'``                           | Which interface and host name to listen upon
``port``                        | ``PORT``              | ``8080``                                  | What port to open
``lockDir``                     | ``LOCK_DIR``          | ``'data'``                                | Where to put WebDAV lock files
``tmpDir``                      | ``TMP_DIR``           | ``'tmp'``                                 | Where to put WebDAV temporary files
``httpBasePath``                | ``HTTP_BASE_PATH``    | ``'/'``                                   | Where on the URL to put the WebDAV mount point (by default the root to work with Windows XP)
``amazonCredentialsJsonFile``   | N/A                   | ``.amazon-credentials.json``              | Where to cache the credentials when not running
``amazonAuth.client_id``        | N/A                   | ...                                       | The ``client_id`` required for authorizing against Amazon Cloud Drive
``amazonAuth.client_secret``    | N/A                   | N/A                                       | An optional ``client_secret`` if you don't want access to periodically time out
``amazonAuth.scope``            | N/A                   | ``clouddrive:read_all clouddrive:write``  | What permissions this application needs within Amazon's auth framework
``amazonAuth.redirect_uri``     | N/A                   | ``http://localhost:8080/signin.html``     | Where Amazon should send the login info - **should match hostname and port above**

Additionally, the config module supports several other interfaces, including using the ``NODE_CONFIG`` command online option or environment variable. Read more [here](https://www.npmjs.com/package/config).

# Debug #

If running this as an application (and not as a jsDAV plugin), use the environment variable ``JSDAV_DEBUG=true`` to turn on debugging.

# References #

* [Amazon Cloud Drive Developer Documentation](https://developer.amazon.com/public/apis/experience/cloud-drive/)
* [jsDAV](https://github.com/mikedeboer/jsDAV)
* [jsDAV Google Group](https://groups.google.com/forum/#!forum/jsdav)
* [NodeJS API](https://nodejs.org/api/)
* [Why not use aws-sdk-js?](https://github.com/aws/aws-sdk-net/issues/188)
* [ExpressJS API](http://expressjs.com/api.html)
