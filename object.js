// References
var Promise = require('promise');
var _ = require('underscore');
var WarpError = require('./error');
var moment = require('moment-timezone');

module.exports = {
    extend: function() {
        // Class constructor
        var WarpObject = function(className, attributes) {
            this.id = null;
            this.createdAt = null;
            this.updatedAt = null;
            this.className = className;
            this._isNew = true;
            this._isDirty = false;
            this._attributes = {};
            this._increments = {};
            if(attributes) this.set(attributes);
            this.initialize();
        };

        // Instance methods
        _.extend(WarpObject.prototype, {    
            _getEndpoint: function(className) {
                return 'classes/' + className;
            },
            _set: function(attr, value) {
                if(typeof attr !== 'undefined' && typeof value === 'null')
                    this._attributes[attr] = null;
                else if(value && typeof value === 'object')
                {
                    if(value.className)
                        if(!value._isNew)
                            this._attributes[attr] = value;
                        else
                            throw new WarpError(WarpError.Code.ForbiddenOperation, 'Cannot set a new Pointer as a key, please save the Pointer before using it');
                    else if(value.fileKey)
                        if(!value._isNew)
                            this._attributes[attr] = value;
                        else
                            throw new WarpError(WarpError.Code.ForbiddenOperation, 'Cannot set a new File as a key, please save the File before using it');
                    else if(value.type === 'Pointer' || value.type === 'File')
                        this._attributes[attr] = value;
                    else if(value.type === 'Increment')
                        throw new WarpError(WarpError.Code.ForbiddenOperation, 'Cannot directly set an increment object, please use the `increment` function instead');
                    else if(value instanceof Date)
                        this._attributes[attr] = moment(value).format();
                    else
                        this._attributes[attr] = value;
                }
                else if(typeof attr !== 'undefined' && typeof value !== 'undefined')
                    if(attr != 'className' && attr != 'id' && attr != 'created_at' && attr != 'updated_at')
                        this._attributes[attr] = value;
            },
            initialize: function() {
                // Empty function; Override with User-defined version
            },
            set: function(attr, value) {
                var oldAttr = _.extend({}, this._attributes);
                if(typeof attr === 'object')
                    for(var key in attr)
                        this._set(key, attr[key]);
                else
                    this._set(attr, value);
                //if(!_.isEqual(oldAttr, this._attributes)) this._isDirty = true;
                this._isDirty = true;
                return this;
            },
            get: function(attr) {
                return this._attributes[attr];
            },
            increment: function(attr, value) {
                if(value === null) this._increments[attr] = 0;
                if(isNaN(value) || parseInt(value) != value) throw new WarpError(WarpError.Code.InvalidObjectKey, 'The increment value must be an integer');
                this._increments[attr] = parseInt(value);
                this._isDirty = true;
                return this;
            },
            save: function(next, fail) {
                // Check configurations
                if(!WarpObject._http) throw new WarpError(WarpError.Code.MissingConfiguration, 'Missing HTTP for Object');
                if(!this._isNew && !this._isDirty)
                {
                    var request = new Promise(function(resolve, reject) {
                        resolve(this);
                    }.bind(this));
                    
                    if(typeof next === 'function')
                        request = request.then(next);
                    if(typeof fail === 'function')
                        request = request.catch(fail);
                    return request;
                }
                
                // Set the `isDirty` toggle to false
                this._isDirty = false;
                
                // Prepare params and request
                var params = _.extend({}, this._attributes);
                var request = null;
                
                // Modify `pointer` and `file` params
                for(var key in params)
                {
                    var param = params[key];
                    if(param && typeof param === 'object')
                        if(param.className)
                            params[key] = { type: 'Pointer', className: param.className, id: param.id };
                        else if(param.fileKey)
                            params[key] = { type: 'File', key: param.fileKey };
                }

                // Modify `increment` params
                for(var key in this._increments)
                {
                    var increment = this._increments[key];
                    params[key] = { type: 'Increment', value: increment };
                }
                
                if(this._isNew)
                    request = WarpObject._http.create(this._getEndpoint(this.className), params).then(function(result) {
                        this.id = result.id;
                        this.createdAt = result.created_at;
                        this.updatedAt = result.updated_at;
                        this._isNew = false;
                        return this;
                    }.bind(this));
                else
                    request = WarpObject._http.update(this._getEndpoint(this.className), this.id, params).then(function(result) {
                        Object.keys(result).forEach(function(key) {
                            if(key !== 'id' && key !== 'created_at' && key !== 'updated_at')
                                this.set(key, result[key]);
                        }.bind(this));
                        this.updatedAt = result.updated_at;
                        return this;
                    }.bind(this));
                    
                // Check args
                if(typeof next === 'function')
                    request = request.then(next);
                if(typeof fail === 'function')
                    request = request.catch(fail);
                return request;
            },
            destroy: function(next, fail) {
                // Check configurations
                if(!WarpObject._http) throw new WarpError(WarpError.Code.MissingConfiguration, 'Missing HTTP for Object');
                if(this._isNew) 
                {
                    var request = new Promise(function(resolve, reject) {
                        this._attributes = {};
                        this.id = null;
                        this.createdAt = null;
                        this.updatedAt = null;
                        this._isDirty = false;
                        resolve(this);
                    }.bind(this));
                    
                    if(typeof next === 'function')
                        request = request.then(next);
                    if(typeof fail === 'function')
                        request = request.catch(fail);
                    return request;
                }
                
                var request = WarpObject._http.destroy(this._getEndpoint(this.className), this.id).then(function() {
                    this._attributes = {};
                    this.id = null;
                    this.createdAt = null;
                    this.updatedAt = null;
                    this._isDirty = false;
                    return this;
                }.bind(this));
                
                if(typeof next === 'function')
                    request = request.then(next);
                if(typeof fail === 'function')
                    request = request.catch(fail);            
                return request;                
            },
            toJSON: function() {
                var item = {
                    className: this.className,
                    id: this.id,
                    created_at: this.createdAt,
                    updated_at: this.updatedAt
                };

                var attrs = this._attributes;
                
                for(var key in attrs)
                {
                    var attr = attrs[key];
                    
                    // Check if attr is an object
                    if(attr && typeof attr === 'object')
                        if(attr.className)
                        {
                            var pointer = attr;
                            if(typeof attr.toJSON === 'function') pointer = attr.toJSON();
                            attr = {
                                type: 'Pointer',
                                className: pointer.className,
                                id: pointer.id
                            };
                            //delete pointer.type;
                            delete pointer.className;
                            delete pointer.id;
                            if(Object.keys(pointer).length > 0) attr.attributes = pointer;
                        }
                        else if(attr.fileKey)
                            attr = { type: 'File', key: attr.fileKey };

                    // Set item attribute
                    item[key] = attr;
                }

                return item;
            }
        });

        // Static methods
        _.extend(WarpObject, {
            _http: null,
            _subclasses: {},
            initialize: function(http) {
                this._http = http;
            },
            createWithoutData: function(id, className) {        
                var instance = new this();
                instance.id = id;
                instance._isNew = false;
                if(className) instance.className = className;
                return instance;
            },
            registerSubclass: function(subclass) {
                this._subclasses[subclass.className] = subclass;
            },
            getSubclass: function(className) {
                var subclass = this._subclasses[className] 
                return subclass ? subclass : this;
            },
            extend: function(className, instanceProps, classProps) {
                var parentProto = WarpObject.prototype;        
                var self = this;
                
                if(this.hasOwnProperty('__super__') && this.__super__)
                    parentProto = this.prototype;
                    
                var WarpObjectSubclass = function(attributes)
                {
                    self.apply(this, [className, attributes]);
                    this.className = className;
                    this.set(attributes || {});
                    
                    if(typeof this.initialize === 'function')
                        this.initialize.apply(this, arguments);
                }
                WarpObjectSubclass.className = className;
                WarpObjectSubclass.__super__ = parentProto;
                
                // Use underscore create for compatibility; In the future, use Object.create
                WarpObjectSubclass.prototype = _.create(parentProto, {
                    constructor: WarpObjectSubclass
                });
                
                // Use underscore extend for compatibility; In the future, use Object.defineProperty
                _.extend(WarpObjectSubclass.prototype, instanceProps);
                _.extend(WarpObjectSubclass, classProps);
                        
                WarpObjectSubclass.extend = function(name, instanceProps, classProps) {
                    return WarpObject.extend.call(WarpObjectSubclass, name, instanceProps, classProps);
                };
                WarpObjectSubclass.createWithoutData = WarpObject.createWithoutData;
                        
                return WarpObjectSubclass;
            }
        });
    
        return WarpObject;
    }
};