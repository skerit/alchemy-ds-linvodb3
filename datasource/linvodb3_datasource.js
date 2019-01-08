var LinvoDBCollection = alchemy.use('linvodb3'),
    leveldown = alchemy.use('leveldown'),
    libpath = alchemy.use('path'),
    bson = alchemy.use('bson');

LinvoDBCollection.defaults.store = {
	db : leveldown
};

/**
 * LinvoDB3 Datasource, based on MongoDB
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
var LinvoDS = Function.inherits('Alchemy.MongoDatasource', function Linvodb3Datasource(name, _options) {

	var options,
	    uri;

	// Define default options
	this.options = {
		folder: null
	};

	Datasource.call(this, name, _options);

	// Cache collections in here
	this.collections = {};
});

/**
 * Prepare value to be stored in the database
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
LinvoDS.setMethod(function _valueToDatasource(field, value, data, callback) {

	var result;

	switch (field.datatype) {

		case 'objectid':
			result = ''+value;
			break;

		default:
			result = value;
	};

	setImmediate(function immediateDelay() {
		callback(null, result);
	});
});

/**
 * Prepare value to be returned to the app
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
LinvoDS.setMethod(function _valueToApp(field, query, options, value, callback) {

	var result;

	switch (field.datatype) {

		case 'objectid':
			result = alchemy.castObjectId(value);

		default:
			result = value;
	};

	setImmediate(function immediateDelay() {
		callback(null, result);
	});
});

/**
 * Get a connection to the database
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.3.0
 * @version  0.3.0
 *
 * @param    {Function}   callback
 */
LinvoDS.setMethod(function connect(callback) {
	if (callback) callback(null);
});

/**
 * Get an LinvoDB3 collection
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   callback
 */
LinvoDS.setMethod(function collection(name, callback) {

	var that = this,
	    dummy_schema,
	    folder_path,
	    collection,
	    config;

	if (this.collections[name]) {
		setImmediate(function cachedCollection() {
			callback(null, that.collections[name]);
		});

		return;
	}

	dummy_schema = {};

	if (this.options.folder) {
		folder_path = libpath.resolve(PATH_ROOT, this.options.folder, name + '.db');
	} else {
		console.warn('Storing database files in temporary folder');
		folder_path = libpath.resolve(PATH_TEMP, 'linvodb3', name + '.db');
	}

	collection = new LinvoDBCollection(name, dummy_schema, {filename: folder_path});

	that.collections[name] = collection;

	callback(null, collection);
});

/**
 * Create a record in the database
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
LinvoDS.setMethod(function _create(model, data, options, callback) {

	this.collection(model.table, function gotCollection(err, collection) {

		if (err != null) {
			return callback(err);
		}

		collection.insert(data, function afterInsert(err, result) {

			// Clear the cache
			model.nukeCache();

			if (err != null) {
				return callback(err, result);
			}

			callback(null, Object.assign({}, data));
		});
	});
});

/**
 * Query the database
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
LinvoDS.setMethod(function _read(model, query, _options, callback) {

	this.collection(model.table, function gotCollection(err, collection) {

		var options,
		    cursor,
		    temp,
		    key;

		if (err != null) {
			return callback(err);
		}

		options = Object.assign({}, _options);

		// Primitive way to make sure objectids are cast to strings
		Object.walk(query, function eachEntry(value, key, parent) {
			// ObjectID values always need to be strings in nedb
			// This should be moved somewhere else, but it'll do for now
			if (value && typeof value == 'object' && value.constructor && value.constructor.name == 'ObjectID') {
				parent[key] = ''+value;
			}
		});

		// Create the cursor
		cursor = collection.find(query);

		// LinvoDB3 doesn't support passing a second object to the find method,
		// so we have to do it manually
		if (options.sort) {
			cursor.sort(options.sort);
		}

		if (options.skip) {
			cursor.skip(options.skip);
		}

		if (options.limit) {
			cursor.limit(options.limit);
		}

		Function.parallel({
			available: function getAvailable(next) {

				if (options.available === false) {
					return next(null, null);
				}

				// LinvoDB3 has no count on the cursor,
				// it is a separate method of the collection
				collection.count(query, next);
			},
			items: function getItems(next) {
				cursor.exec(next);
			}
		}, function done(err, data) {

			if (err != null) {
				return callback(err);
			}

			// There is no cache because LinvoDB3 stores everything in memory
			// anyway, it seems kind of silly

			callback(err, data.items, data.available);
		});
	});
});

/**
 * Ensure an index in the database
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
LinvoDS.setMethod(function _ensureIndex(model, index, callback) {

	this.collection(model.table, function gotCollection(err, collection) {

		var options,
		    field,
		    obj,
		    key;

		if (err != null) {
			return callback(err);
		}

		if (Array.isArray(index.fields)) {
			field = index.fields[0];
		} else if (typeof index.fields == 'string') {
			field = index.fields;
		} else if (index.fields) {
			field = Object.keys(index.fields)[0];
		}

		options = {
			fieldName: field,
			name: index.options.name
		};

		if (index.options.unique) {
			options.unique = true;
		}

		if (index.options.sparse) {
			options.sparse = true;
		}

		collection.ensureIndex(options, callback);
	});
});