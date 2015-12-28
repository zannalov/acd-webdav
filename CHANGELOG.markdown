Version 0.0.2
* Removed incorrect reference links
* Support loading as library
* Always use ``callback( err , args )`` format
* Move config beneath library load
* Preparing to share auth with jsDAV backend
* Implemented read functionality for folders and metadata
* Implemented read functionality for files along with support for partial loading via range header

Version 0.0.1
* Example config file (if you ``npm install config``)
* Investigated using aws-sdk-js, will not work for this project
* Settled on using Express for handling Amazon auth callback (would have added significant code to handle by hand)
* Figured out how to integrate jsDAV on top of ExpressJS
* Restricted use to 'localhost'
* Using [open](https://www.npmjs.com/package/open) package to load URLs, but will log them as well
* Created a rudimentary Amazon auth library for managing credentials, because aws-sdk-js won't work here
* Got application successfully authenticating against Amazon, fetching endpoints, refreshing tokens, and storing tokens until they refresh
* Moved config example to be the default and seeded with my own client\_id (but not secret)
* Removed debugMode from config as I want to use a logger later instead
* Documented config options
* Amazon Auth sends certain credentials as the hash of the URL, but we need them in the server, so signin.html makes sure either query params or hash params get passed to the /signin route as query params

Version 0.0.0
* Initialized repository
* Added LICENSE.markdown
* Added CHANGELOG.markdown
* Added CONTRIBUTING.markdown
