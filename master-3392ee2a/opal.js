(function(undefined) {
  // @note
  //   A few conventions for the documentation of this file:
  //   1. Always use "//" (in contrast with "/**/")
  //   2. The syntax used is Yardoc (yardoc.org), which is intended for Ruby (se below)
  //   3. `@param` and `@return` types should be preceded by `JS.` when referring to
  //      JavaScript constructors (e.g. `JS.Function`) otherwise Ruby is assumed.
  //   4. `nil` and `null` being unambiguous refer to the respective
  //      objects/values in Ruby and JavaScript
  //   5. This is still WIP :) so please give feedback and suggestions on how
  //      to improve or for alternative solutions
  //
  //   The way the code is digested before going through Yardoc is a secret kept
  //   in the docs repo (https://github.com/opal/docs/tree/master).

  var global_object = this, console;

  // Detect the global object
  if (typeof(global) !== 'undefined') { global_object = global; }
  if (typeof(window) !== 'undefined') { global_object = window; }

  // Setup a dummy console object if missing
  if (typeof(global_object.console) === 'object') {
    console = global_object.console;
  } else if (global_object.console == null) {
    console = global_object.console = {};
  } else {
    console = {};
  }

  if (!('log' in console)) { console.log = function () {}; }
  if (!('warn' in console)) { console.warn = console.log; }

  if (typeof(this.Opal) !== 'undefined') {
    console.warn('Opal already loaded. Loading twice can cause troubles, please fix your setup.');
    return this.Opal;
  }

  var nil;

  // The actual class for BasicObject
  var BasicObject;

  // The actual Object class.
  // The leading underscore is to avoid confusion with window.Object()
  var _Object;

  // The actual Module class
  var Module;

  // The actual Class class
  var Class;

  // Constructor for instances of BasicObject
  function BasicObject_alloc(){}

  // Constructor for instances of Object
  function Object_alloc(){}

  // Constructor for instances of Class
  function Class_alloc(){}

  // Constructor for instances of Module
  function Module_alloc(){}

  // Constructor for instances of NilClass (nil)
  function NilClass_alloc(){}

  // The Opal object that is exposed globally
  var Opal = this.Opal = {};

  // All bridged classes - keep track to donate methods from Object
  var BridgedClasses = {};

  // TopScope is used for inheriting constants from the top scope
  var TopScope = function(){};

  // Opal just acts as the top scope
  TopScope.prototype = Opal;

  // To inherit scopes
  Opal.constructor = TopScope;

  // List top scope constants
  Opal.constants = [];

  // This is a useful reference to global object inside ruby files
  Opal.global = global_object;
  global_object.Opal = Opal;

  // Configure runtime behavior with regards to require and unsupported fearures
  Opal.config = {
    missing_require_severity: 'error', // error, warning, ignore
    unsupported_features_severity: 'warning' // error, warning, ignore
  }

  // Minify common function calls
  var $hasOwn = Opal.hasOwnProperty;
  var $slice  = Opal.slice = Array.prototype.slice;

  // Nil object id is always 4
  var nil_id = 4;

  // Generates even sequential numbers greater than 4
  // (nil_id) to serve as unique ids for ruby objects
  var unique_id = nil_id;

  // Return next unique id
  Opal.uid = function() {
    unique_id += 2;
    return unique_id;
  };

  // Retrieve or assign the id of an object
  Opal.id = function(obj) {
    return obj.$$id || (obj.$$id = Opal.uid());
  };

  // Table holds all class variables
  Opal.cvars = {};

  // Globals table
  Opal.gvars = {};

  // Exit function, this should be replaced by platform specific implementation
  // (See nodejs and phantom for examples)
  Opal.exit = function(status) { if (Opal.gvars.DEBUG) console.log('Exited with status '+status); };

  // keeps track of exceptions for $!
  Opal.exceptions = [];

  // @private
  // Pops an exception from the stack and updates `$!`.
  Opal.pop_exception = function() {
    Opal.gvars["!"] = Opal.exceptions.pop() || nil;
  }


  // Constants
  // ---------

  // Get a constant on the given scope. Every class and module in Opal has a
  // scope used to store, and inherit, constants. For example, the top level
  // `Object` in ruby has a scope accessible as `Opal.Object.$$scope`.
  //
  // To get the `Array` class using this scope, you could use:
  //
  //     Opal.Object.$$scope.get("Array")
  //
  // If a constant with the given name cannot be found, then a dispatch to the
  // class/module's `#const_missing` is called, which by default will raise an
  // error.
  //
  // @param name [String] the name of the constant to lookup
  // @return [Object]
  //
  Opal.get = function(const_name) {
    return Opal.const_get([this], const_name, true, true);
  }

  function constGetSingle(scope, const_name, inherit) {
    var scopes = [scope],
        module = scope.base;

    if (inherit || module == Opal.Object) {
      var parent = module.$$super;

      while (parent !== Opal.BasicObject && parent !== Opal.Object) {
        scopes.push(parent.$$scope);

        parent = parent.$$super;
      }
    }

    for (var i = 0, length = scopes.length; i < length; i++) {
      if (scopes[i].hasOwnProperty(const_name)) {
        return scopes[i][const_name];
      }
    }
  }

  function constGetTopLevel(const_name) {
    var global_scope = Opal.Object.$$scope;

    if (global_scope.hasOwnProperty(const_name)) {
      return global_scope[const_name];
    }
  }

  function constGetMultiple(scopes, const_name, inherit) {
    var length = scopes.length,
        last_scope = scopes[length - 1],
        i, scope, result;

    for (i = length - 1; i >= 0; i--) {
      var scope_or_singleton_class = scopes[i];

      if (scope_or_singleton_class.$$is_singleton) {
        scope = scope_or_singleton_class.$$scope;

        if (scope_or_singleton_class === last_scope) {
          // If we perform a constant lookup directly in the metaclass
          // then we should look into its ancestors (inherit = true)
          inherit = true;
        } else {
          // Otherwise we are looking for a constant declared in the
          // normal scope (class/module) which was declared in the metaclass
          // @example
          //   class << obj
          //     module M
          //       CONST
          //     end
          //   end
          // In this case we shouldn't look into metaclass ancestors
          inherit = false;
        }
      } else {
        // We are in the regular class/module scope
        scope = scope_or_singleton_class;
        // Leaving requested inherit value from parameters
      }

      if (scope.hasOwnProperty(const_name)) {
        result = scope[const_name];
      }

      if (result != null) {
        return result;
      }

      result = constGetSingle(scope, const_name, inherit);

      if (result != null) {
        return result;
      }
    }
  }

  // Finds and returns a constant in the provided list of scopes.
  // When you open a class/module/singleton class, Opal collects
  // scopes in the $scopes array. When you try to resolve
  // a constant Opal.const_get is used to get it.
  //
  // To simply find a constant directly in the single scope:
  //
  //     Opal.const_get([scope], const_name)
  //
  // To search in parents:
  //
  //     Opal.const_get(scopes, const_name, true)
  //
  // To throw an error if nothing was found:
  //
  //     Opal.const_get(scopes, const_name, inherit, true)
  //
  // @param scopes [Array<$$scope>] a list of scopes
  // @param const_name [String] the name of the constant
  // @param inherit [Boolean] flag to perform a search in the parents
  // @param raise [Boolean] flag to trigger "const_missing" if nothing was found
  // @return [Object]
  Opal.const_get = function(scopes, const_name, inherit, raise) {
    var result = constGetMultiple(scopes, const_name, inherit);

    if (result != null) {
      return result;
    }

    if (inherit) {
      result = constGetTopLevel(const_name);
    }

    if (result != null) {
      return result;
    }

    if (raise) {
      var last_scope_base = scopes[scopes.length - 1].base;

      if (last_scope_base.$$is_a_module) {
        return last_scope_base.$const_missing(const_name);
      }
    }
  }

  // Create a new constants scope for the given class with the given
  // base. Constants are looked up through their parents, so the base
  // scope will be the outer scope of the new klass.
  //
  // @param base_scope [$$scope] the scope in which the new scope should be created
  // @param klass      [Class]
  // @param id         [String, null] the name of the newly created scope
  //
  Opal.create_scope = function(base_scope, klass, id) {
    var const_alloc = function() {};
    var const_scope = const_alloc.prototype = new base_scope.constructor();

    klass.$$scope       = const_scope;
    klass.$$base_module = base_scope.base;

    const_scope.base        = klass;
    const_scope.constructor = const_alloc;
    const_scope.constants   = [];

    if (id) {
      Opal.cdecl(base_scope, id, klass);
      const_alloc.displayName = id+"_scope_alloc";
    }
  };

  // Constant assignment, see also `Opal.cdecl`
  //
  // @param base_module [Module, Class] the constant namespace
  // @param name        [String] the name of the constant
  // @param value       [Object] the value of the constant
  //
  // @example Assigning a namespaced constant
  //   self::FOO = 'bar'
  //
  // @example Assigning with Module#const_set
  //   Foo.const_set :BAR, 123
  //
  Opal.casgn = function(base_module, name, value) {
    function update(klass, name) {
      klass.$$name = name;

      for (name in klass.$$scope) {
        var value = klass.$$scope[name];

        if (value.$$name === nil && (value.$$is_class || value.$$is_module)) {
          update(value, name)
        }
      }
    }

    var scope = base_module.$$scope;

    if (value.$$is_class || value.$$is_module) {
      // Only checking _Object prevents setting a const on an anonymous class
      // that has a superclass that's not Object
      if (value.$$is_class || value.$$base_module === _Object) {
        value.$$base_module = base_module;
      }

      if (value.$$name === nil && value.$$base_module.$$name !== nil) {
        update(value, name);
      }
    }

    scope.constants.push(name);
    scope[name] = value;

    // If we dynamically declare a constant in a module,
    // we should populate all the classes that include this module
    // with the same constant
    if (base_module.$$is_module && base_module.$$included_in) {
      for (var i = 0; i < base_module.$$included_in.length; i++) {
        var dep = base_module.$$included_in[i];
        Opal.casgn(dep, name, value);
      }
    }

    return value;
  };

  // Constant declaration
  //
  // @example
  //   FOO = :bar
  //
  // @param base_scope [$$scope] the current scope
  // @param name       [String] the name of the constant
  // @param value      [Object] the value of the constant
  Opal.cdecl = function(base_scope, name, value) {
    if ((value.$$is_class || value.$$is_module) && value.$$orig_scope == null) {
      value.$$name = name;
      value.$$orig_scope = base_scope;
      // Here we should explicitly set a base module
      // (a module where the constant was initially defined)
      value.$$base_module = base_scope.base;
      base_scope.constructor[name] = value;
    }

    base_scope.constants.push(name);
    return base_scope[name] = value;
  };


  // Modules & Classes
  // -----------------

  // A `class Foo; end` expression in ruby is compiled to call this runtime
  // method which either returns an existing class of the given name, or creates
  // a new class in the given `base` scope.
  //
  // If a constant with the given name exists, then we check to make sure that
  // it is a class and also that the superclasses match. If either of these
  // fail, then we raise a `TypeError`. Note, `superclass` may be null if one
  // was not specified in the ruby code.
  //
  // We pass a constructor to this method of the form `function ClassName() {}`
  // simply so that classes show up with nicely formatted names inside debuggers
  // in the web browser (or node/sprockets).
  //
  // The `base` is the current `self` value where the class is being created
  // from. We use this to get the scope for where the class should be created.
  // If `base` is an object (not a class/module), we simple get its class and
  // use that as the base instead.
  //
  // @param base        [Object] where the class is being created
  // @param superclass  [Class,null] superclass of the new class (may be null)
  // @param id          [String] the name of the class to be created
  // @param constructor [JS.Function] function to use as constructor
  //
  // @return new [Class]  or existing ruby class
  //
  Opal.klass = function(base, superclass, name, constructor) {
    var klass, bridged, alloc;

    // If base is an object, use its class
    if (!base.$$is_class && !base.$$is_module) {
      base = base.$$class;
    }

    // If the superclass is a function then we're bridging a native JS class
    if (typeof(superclass) === 'function') {
      bridged = superclass;
      superclass = _Object;
    }

    // Try to find the class in the current scope
    klass = base.$$scope[name];

    // If the class exists in the scope, then we must use that
    if (klass && klass.$$orig_scope === base.$$scope) {
      // Make sure the existing constant is a class, or raise error
      if (!klass.$$is_class) {
        throw Opal.TypeError.$new(name + " is not a class");
      }

      // Make sure existing class has same superclass
      if (superclass && klass.$$super !== superclass) {
        throw Opal.TypeError.$new("superclass mismatch for class " + name);
      }

      return klass;
    }

    // Class doesnt exist, create a new one with given superclass...

    // Not specifying a superclass means we can assume it to be Object
    if (superclass == null) {
      superclass = _Object;
    }

    // If bridged the JS class will also be the alloc function
    alloc = bridged || Opal.boot_class_alloc(name, constructor, superclass);

    // Create the class object (instance of Class)
    klass = Opal.setup_class_object(name, alloc, superclass.$$name, superclass.constructor);

    // @property $$super the superclass, doesn't get changed by module inclusions
    klass.$$super = superclass;

    // @property $$parent direct parent class
    //                    starts with the superclass, after klass inclusion is
    //                    the last included klass
    klass.$$parent = superclass;

    // Every class gets its own constant scope, inherited from current scope
    Opal.create_scope(base.$$scope, klass, name);

    // Name new class directly onto current scope (Opal.Foo.Baz = klass)
    base[name] = klass;

    if (bridged) {
      Opal.bridge(klass, alloc);
    }
    else {
      // Copy all parent constants to child, unless parent is Object
      if (superclass !== _Object && superclass !== BasicObject) {
        Opal.donate_constants(superclass, klass);
      }

      // Call .inherited() hook with new class on the superclass
      if (superclass.$inherited) {
        superclass.$inherited(klass);
      }
    }

    return klass;
  };

  // Boot a base class (makes instances).
  //
  // @param name [String,null] the class name
  // @param constructor [JS.Function] the class' instances constructor/alloc function
  // @param superclass  [Class,null] the superclass object
  // @return [JS.Function] the consturctor holding the prototype for the class' instances
  Opal.boot_class_alloc = function(name, constructor, superclass) {
    if (superclass) {
      var alloc_proxy = function() {};
      alloc_proxy.prototype = superclass.$$proto || superclass.prototype;
      constructor.prototype = new alloc_proxy();
    }

    if (name) {
      constructor.displayName = name+'_alloc';
    }

    constructor.prototype.constructor = constructor;

    return constructor;
  };

  Opal.setup_module_or_class = function(module) {
    // @property $$id Each class/module is assigned a unique `id` that helps
    //                comparation and implementation of `#object_id`
    module.$$id = Opal.uid();

    // @property $$is_a_module Will be true for Module and its subclasses
    //                         instances (namely: Class).
    module.$$is_a_module = true;

    // @property $$inc included modules
    module.$$inc = [];

    // initialize the name with nil
    module.$$name = nil;

    // @property $$cvars class variables defined in the current module
    module.$$cvars = Object.create(null);
  }



  // Adds common/required properties to class object (as in `Class.new`)
  //
  // @param name  [String,null] The name of the class
  //
  // @param alloc [JS.Function] The constructor of the class' instances
  //
  // @param superclass_name [String,null]
  //   The name of the super class, this is
  //   usefule to build the `.displayName` of the singleton class
  //
  // @param superclass_alloc [JS.Function]
  //   The constructor of the superclass from which the singleton_class is
  //   derived.
  //
  // @return [Class]
  Opal.setup_class_object = function(name, alloc, superclass_name, superclass_alloc) {
    // Grab the superclass prototype and use it to build an intermediary object
    // in the prototype chain.
    var superclass_alloc_proxy = function() {};
        superclass_alloc_proxy.prototype = superclass_alloc.prototype;
        superclass_alloc_proxy.displayName = superclass_name;

    var singleton_class_alloc = function() {}
        singleton_class_alloc.prototype = new superclass_alloc_proxy();

    // The built class is the only instance of its singleton_class
    var klass = new singleton_class_alloc();

    Opal.setup_module_or_class(klass);

    // @property $$alloc This is the constructor of instances of the current
    //                   class. Its prototype will be used for method lookup
    klass.$$alloc = alloc;

    klass.$$name = name || nil;

    // Set a displayName for the singleton_class
    singleton_class_alloc.displayName = "#<Class:"+(name || ("#<Class:"+klass.$$id+">"))+">";

    // @property $$proto This is the prototype on which methods will be defined
    klass.$$proto = alloc.prototype;

    // @property $$proto.$$class Make available to instances a reference to the
    //                           class they belong to.
    klass.$$proto.$$class = klass;

    // @property constructor keeps a ref to the constructor, but apparently the
    //                       constructor is already set on:
    //
    //                          `var klass = new constructor` is called.
    //
    //                       Maybe there are some browsers not abiding (IE6?)
    klass.constructor = singleton_class_alloc;

    // @property $$is_class Clearly mark this as a class
    klass.$$is_class = true;

    // @property $$class Classes are instances of the class Class
    klass.$$class    = Class;

    return klass;
  };

  // Define new module (or return existing module). The given `base` is basically
  // the current `self` value the `module` statement was defined in. If this is
  // a ruby module or class, then it is used, otherwise if the base is a ruby
  // object then that objects real ruby class is used (e.g. if the base is the
  // main object, then the top level `Object` class is used as the base).
  //
  // If a module of the given name is already defined in the base, then that
  // instance is just returned.
  //
  // If there is a class of the given name in the base, then an error is
  // generated instead (cannot have a class and module of same name in same base).
  //
  // Otherwise, a new module is created in the base with the given name, and that
  // new instance is returned back (to be referenced at runtime).
  //
  // @param  base [Module, Class] class or module this definition is inside
  // @param  id   [String] the name of the new (or existing) module
  //
  // @return [Module]
  Opal.module = function(base, name) {
    var module;

    if (!base.$$is_class && !base.$$is_module) {
      base = base.$$class;
    }

    if ($hasOwn.call(base.$$scope, name)) {
      module = base.$$scope[name];

      if (!module.$$is_module && module !== _Object) {
        throw Opal.TypeError.$new(name + " is not a module");
      }
    }
    else {
      module = Opal.module_allocate(Module);
      Opal.create_scope(base.$$scope, module, name);
    }

    return module;
  };

  // The implementation for Module#initialize
  // @param module [Module]
  // @param block [Proc,nil]
  // @return nil
  Opal.module_initialize = function(module, block) {
    if (block !== nil) {
      var block_self = block.$$s;
      block.$$s = null;
      block.call(module);
      block.$$s = block_self;
    }
    return nil;
  };

  // Internal function to create a new module instance. This simply sets up
  // the prototype hierarchy and method tables.
  //
  Opal.module_allocate = function(superclass) {
    var mtor = function() {};
    mtor.prototype = superclass.$$alloc.prototype;

    function module_constructor() {}
    module_constructor.prototype = new mtor();

    var module = new module_constructor();
    var module_prototype = {};

    Opal.setup_module_or_class(module);

    // initialize dependency tracking
    module.$$included_in = [];

    // Set the display name of the singleton prototype holder
    module_constructor.displayName = "#<Class:#<Module:"+module.$$id+">>"

    // @property $$proto This is the prototype on which methods will be defined
    module.$$proto = module_prototype;

    // @property constructor
    //   keeps a ref to the constructor, but apparently the
    //   constructor is already set on:
    //
    //      `var module = new constructor` is called.
    //
    //   Maybe there are some browsers not abiding (IE6?)
    module.constructor = module_constructor;

    // @property $$is_module Clearly mark this as a module
    module.$$is_module = true;
    module.$$class     = Module;

    // @property $$super
    //   the superclass, doesn't get changed by module inclusions
    module.$$super = superclass;

    // @property $$parent
    //   direct parent class or module
    //   starts with the superclass, after module inclusion is
    //   the last included module
    module.$$parent = superclass;

    return module;
  };

  // Return the singleton class for the passed object.
  //
  // If the given object alredy has a singleton class, then it will be stored on
  // the object as the `$$meta` property. If this exists, then it is simply
  // returned back.
  //
  // Otherwise, a new singleton object for the class or object is created, set on
  // the object at `$$meta` for future use, and then returned.
  //
  // @param object [Object] the ruby object
  // @return [Class] the singleton class for object
  Opal.get_singleton_class = function(object) {
    if (object.$$meta) {
      return object.$$meta;
    }

    if (object.$$is_class || object.$$is_module) {
      return Opal.build_class_singleton_class(object);
    }

    return Opal.build_object_singleton_class(object);
  };

  // Build the singleton class for an existing class. Class object are built
  // with their singleton class already in the prototype chain and inheriting
  // from their superclass object (up to `Class` itself).
  //
  // NOTE: Actually in MRI a class' singleton class inherits from its
  // superclass' singleton class which in turn inherits from Class.
  //
  // @param klass [Class]
  // @return [Class]
  Opal.build_class_singleton_class = function(object) {
    var alloc, superclass, klass;

    if (object.$$meta) {
      return object.$$meta;
    }

    // The constructor and prototype of the singleton_class instances is the
    // current class constructor and prototype.
    alloc = object.constructor;

    // The singleton_class superclass is the singleton_class of its superclass;
    // but BasicObject has no superclass (its `$$super` is null), thus we
    // fallback on `Class`.
    superclass = object === BasicObject ? Class : Opal.build_class_singleton_class(object.$$super);

    klass = Opal.setup_class_object(null, alloc, superclass.$$name, superclass.constructor);
    klass.$$super  = superclass;
    klass.$$parent = superclass;

    // The singleton_class retains the same scope as the original class
    Opal.create_scope(object.$$scope, klass);

    klass.$$is_singleton = true;
    klass.$$singleton_of = object;

    return object.$$meta = klass;
  };

  // Build the singleton class for a Ruby (non class) Object.
  //
  // @param object [Object]
  // @return [Class]
  Opal.build_object_singleton_class = function(object) {
    var superclass = object.$$class,
        name = "#<Class:#<" + superclass.$$name + ":" + superclass.$$id + ">>";

    var alloc = Opal.boot_class_alloc(name, function(){}, superclass)
    var klass = Opal.setup_class_object(name, alloc, superclass.$$name, superclass.constructor);

    klass.$$super  = superclass;
    klass.$$parent = superclass;
    klass.$$class  = superclass.$$class;
    klass.$$scope  = superclass.$$scope;
    klass.$$proto  = object;

    klass.$$is_singleton = true;
    klass.$$singleton_of = object;

    return object.$$meta = klass;
  };

  // Returns an object containing all pairs of names/values
  // for all class variables defined in provided +module+
  // and its ancestors.
  //
  // @param module [Module]
  // @return [Object]
  Opal.class_variables = function(module) {
    var ancestors = Opal.ancestors(module),
        i, length = ancestors.length,
        result = {};

    for (i = length - 1; i >= 0; i--) {
      var ancestor = ancestors[i];

      for (var cvar in ancestor.$$cvars) {
        result[cvar] = ancestor.$$cvars[cvar];
      }
    }

    return result;
  }

  // Sets class variable with specified +name+ to +value+
  // in provided +module+
  //
  // @param module [Module]
  // @param name [String]
  // @param value [Object]
  Opal.class_variable_set = function(module, name, value) {
    var ancestors = Opal.ancestors(module),
        i, length = ancestors.length;

    for (i = length - 2; i >= 0; i--) {
      var ancestor = ancestors[i];

      if ($hasOwn.call(ancestor.$$cvars, name)) {
        ancestor.$$cvars[name] = value;
        return value;
      }
    }

    module.$$cvars[name] = value;

    return value;
  }

  // Bridges a single method.
  //
  // @param target [JS::Function] the constructor of the bridged class
  // @param from [Module] the module/class we are importing the method from
  // @param name [String] the method name in JS land (i.e. starting with $)
  // @param body [JS::Function] the body of the method
  Opal.bridge_method = function(target_constructor, from, name, body) {
    var ancestors, i, ancestor, length;

    ancestors = target_constructor.$$bridge.$ancestors();

    // order important here, we have to check for method presence in
    // ancestors from the bridged class to the last ancestor
    for (i = 0, length = ancestors.length; i < length; i++) {
      ancestor = ancestors[i];

      if ($hasOwn.call(ancestor.$$proto, name) &&
          ancestor.$$proto[name] &&
          !ancestor.$$proto[name].$$donated &&
          !ancestor.$$proto[name].$$stub &&
          ancestor !== from) {
        break;
      }

      if (ancestor === from) {
        target_constructor.prototype[name] = body
        break;
      }
    }
  };

  // Bridges from *donator* to a *target*.
  //
  // @param target [Module] the potentially associated with bridged classes module
  // @param donator [Module] the module/class source of the methods that should be bridged
  Opal.bridge_methods = function(target, donator) {
    var i,
        bridged = BridgedClasses[target.$__id__()],
        donator_id = donator.$__id__();

    if (bridged) {
      BridgedClasses[donator_id] = bridged.slice();

      for (i = bridged.length - 1; i >= 0; i--) {
        Opal_bridge_methods_to_constructor(bridged[i], donator)
      }
    }
  };

  // Actually bridge methods to the bridged (shared) prototype.
  function Opal_bridge_methods_to_constructor(target_constructor, donator) {
    var i,
        method,
        methods = donator.$instance_methods();

    for (i = methods.length - 1; i >= 0; i--) {
      method = '$' + methods[i];
      Opal.bridge_method(target_constructor, donator, method, donator.$$proto[method]);
    }
  }

  // Associate the target as a bridged class for the current "donator"
  function Opal_add_bridged_constructor(target_constructor, donator) {
    var donator_id = donator.$__id__();

    if (!BridgedClasses[donator_id]) {
      BridgedClasses[donator_id] = [];
    }
    BridgedClasses[donator_id].push(target_constructor);
  }

  // Walks the dependency tree detecting the presence of the base among its
  // own dependencies.
  //
  // @param [Integer] base_id The id of the base module (eg. the "includer")
  // @param [Array<Module>] deps The array of dependencies (eg. the included module, included.$$deps)
  // @param [String] prop The property that holds dependencies (eg. "$$deps")
  // @param [JS::Object] seen A JS object holding the cache of already visited objects
  // @return [Boolean] true if a cyclic dependency is present
  Opal.has_cyclic_dep = function has_cyclic_dep(base_id, deps, prop, seen) {
    var i, dep_id, dep;

    for (i = deps.length - 1; i >= 0; i--) {
      dep = deps[i];
      dep_id = dep.$$id;

      if (seen[dep_id]) {
        continue;
      }
      seen[dep_id] = true;

      if (dep_id === base_id) {
        return true;
      }

      if (has_cyclic_dep(base_id, dep[prop], prop, seen)) {
        return true;
      }
    }

    return false;
  }

  // The actual inclusion of a module into a class.
  //
  // ## Class `$$parent` and `iclass`
  //
  // To handle `super` calls, every class has a `$$parent`. This parent is
  // used to resolve the next class for a super call. A normal class would
  // have this point to its superclass. However, if a class includes a module
  // then this would need to take into account the module. The module would
  // also have to then point its `$$parent` to the actual superclass. We
  // cannot modify modules like this, because it might be included in more
  // then one class. To fix this, we actually insert an `iclass` as the class'
  // `$$parent` which can then point to the superclass. The `iclass` acts as
  // a proxy to the actual module, so the `super` chain can then search it for
  // the required method.
  //
  // @param module [Module] the module to include
  // @param includer [Module] the target class to include module into
  // @return [null]
  Opal.append_features = function(module, includer) {
    var iclass, donator, prototype, methods, id, i;

    // check if this module is already included in the class
    for (i = includer.$$inc.length - 1; i >= 0; i--) {
      if (includer.$$inc[i] === module) {
        return;
      }
    }

    // Check that the base module is not also a dependency, classes can't be
    // dependencies so we have a special case for them.
    if (!includer.$$is_class && Opal.has_cyclic_dep(includer.$$id, [module], '$$inc', {})) {
      throw Opal.ArgumentError.$new('cyclic include detected')
    }

    includer.$$inc.push(module);
    module.$$included_in.push(includer);
    Opal.bridge_methods(includer, module);

    // iclass
    iclass = {
      $$name:   module.$$name,
      $$proto:  module.$$proto,
      $$parent: includer.$$parent,
      $$module: module,
      $$iclass: true
    };

    includer.$$parent = iclass;

    methods = module.$instance_methods();

    for (i = methods.length - 1; i >= 0; i--) {
      Opal.update_includer(module, includer, '$' + methods[i])
    }

    Opal.donate_constants(module, includer);
  };

  // Table that holds all methods that have been defined on all objects
  // It is used for defining method stubs for new coming native classes
  Opal.stubs = {};

  // For performance, some core Ruby classes are toll-free bridged to their
  // native JavaScript counterparts (e.g. a Ruby Array is a JavaScript Array).
  //
  // This method is used to setup a native constructor (e.g. Array), to have
  // its prototype act like a normal Ruby class. Firstly, a new Ruby class is
  // created using the native constructor so that its prototype is set as the
  // target for th new class. Note: all bridged classes are set to inherit
  // from Object.
  //
  // Example:
  //
  //    Opal.bridge(self, Function);
  //
  // @param klass       [Class] the Ruby class to bridge
  // @param constructor [JS.Function] native JavaScript constructor to use
  // @return [Class] returns the passed Ruby class
  //
  Opal.bridge = function(klass, constructor) {
    if (constructor.$$bridge) {
      throw Opal.ArgumentError.$new("already bridged");
    }

    Opal.stub_subscribers.push(constructor.prototype);

    // Populate constructor with previously stored stubs
    for (var method_name in Opal.stubs) {
      if (!(method_name in constructor.prototype)) {
        constructor.prototype[method_name] = Opal.stub_for(method_name);
      }
    }

    constructor.prototype.$$class = klass;
    constructor.$$bridge          = klass;

    var ancestors = klass.$ancestors();

    // order important here, we have to bridge from the last ancestor to the
    // bridged class
    for (var i = ancestors.length - 1; i >= 0; i--) {
      Opal_add_bridged_constructor(constructor, ancestors[i]);
      Opal_bridge_methods_to_constructor(constructor, ancestors[i]);
    }

    for (var name in BasicObject_alloc.prototype) {
      var method = BasicObject_alloc.prototype[method];

      if (method && method.$$stub && !(name in constructor.prototype)) {
        constructor.prototype[name] = method;
      }
    }

    return klass;
  };

  // When a source module is included into the target module, we must also copy
  // its constants to the target.
  //
  Opal.donate_constants = function(source_mod, target_mod) {
    var source_constants = source_mod.$$scope.constants,
        target_scope     = target_mod.$$scope,
        target_constants = target_scope.constants;

    for (var i = 0, length = source_constants.length; i < length; i++) {
      target_constants.push(source_constants[i]);
      target_scope[source_constants[i]] = source_mod.$$scope[source_constants[i]];
    }
  };

  // Update `jsid` method cache of all classes / modules including `module`.
  Opal.update_includer = function(module, includer, jsid) {
    var dest, current, body,
        klass_includees, j, jj, current_owner_index, module_index;

    body    = module.$$proto[jsid];
    dest    = includer.$$proto;
    current = dest[jsid];

    if (dest.hasOwnProperty(jsid) && !current.$$donated && !current.$$stub) {
      // target class has already defined the same method name - do nothing
    }
    else if (dest.hasOwnProperty(jsid) && !current.$$stub) {
      // target class includes another module that has defined this method
      klass_includees = includer.$$inc;

      for (j = 0, jj = klass_includees.length; j < jj; j++) {
        if (klass_includees[j] === current.$$donated) {
          current_owner_index = j;
        }
        if (klass_includees[j] === module) {
          module_index = j;
        }
      }

      // only redefine method on class if the module was included AFTER
      // the module which defined the current method body. Also make sure
      // a module can overwrite a method it defined before
      if (current_owner_index <= module_index) {
        dest[jsid] = body;
        dest[jsid].$$donated = module;
      }
    }
    else {
      // neither a class, or module included by class, has defined method
      dest[jsid] = body;
      dest[jsid].$$donated = module;
    }

    // if the includer is a module, recursively update all of its includres.
    if (includer.$$included_in) {
      Opal.update_includers(includer, jsid);
    }
  };

  // Update `jsid` method cache of all classes / modules including `module`.
  Opal.update_includers = function(module, jsid) {
    var i, ii, includee, included_in;

    included_in = module.$$included_in;

    if (!included_in) {
      return;
    }

    for (i = 0, ii = included_in.length; i < ii; i++) {
      includee = included_in[i];
      Opal.update_includer(module, includee, jsid);
    }
  };

  // The Array of ancestors for a given module/class
  Opal.ancestors = function(module_or_class) {
    var parent = module_or_class,
        result = [],
        modules;

    while (parent) {
      result.push(parent);
      for (var i=0; i < parent.$$inc.length; i++) {
        modules = Opal.ancestors(parent.$$inc[i]);

        for(var j = 0; j < modules.length; j++) {
          result.push(modules[j]);
        }
      }

      // only the actual singleton class gets included in its ancestry
      // after that, traverse the normal class hierarchy
      if (parent.$$is_singleton && parent.$$singleton_of.$$is_module) {
        parent = parent.$$singleton_of.$$super;
      }
      else {
        parent = parent.$$is_class ? parent.$$super : null;
      }
    }

    return result;
  };


  // Method Missing
  // --------------

  // Methods stubs are used to facilitate method_missing in opal. A stub is a
  // placeholder function which just calls `method_missing` on the receiver.
  // If no method with the given name is actually defined on an object, then it
  // is obvious to say that the stub will be called instead, and then in turn
  // method_missing will be called.
  //
  // When a file in ruby gets compiled to javascript, it includes a call to
  // this function which adds stubs for every method name in the compiled file.
  // It should then be safe to assume that method_missing will work for any
  // method call detected.
  //
  // Method stubs are added to the BasicObject prototype, which every other
  // ruby object inherits, so all objects should handle method missing. A stub
  // is only added if the given property name (method name) is not already
  // defined.
  //
  // Note: all ruby methods have a `$` prefix in javascript, so all stubs will
  // have this prefix as well (to make this method more performant).
  //
  //    Opal.add_stubs(["$foo", "$bar", "$baz="]);
  //
  // All stub functions will have a private `$$stub` property set to true so
  // that other internal methods can detect if a method is just a stub or not.
  // `Kernel#respond_to?` uses this property to detect a methods presence.
  //
  // @param stubs [Array] an array of method stubs to add
  // @return [undefined]
  Opal.add_stubs = function(stubs) {
    var subscriber, subscribers = Opal.stub_subscribers,
        i, ilength = stubs.length,
        j, jlength = subscribers.length,
        method_name, stub;

    for (i = 0; i < ilength; i++) {
      method_name = stubs[i];
      // Save method name to populate other subscribers with this stub
      Opal.stubs[method_name] = true;
      stub = Opal.stub_for(method_name);

      for (j = 0; j < jlength; j++) {
        subscriber = subscribers[j];

        if (!(method_name in subscriber)) {
          subscriber[method_name] = stub;
        }
      }
    }
  };

  // Keep a list of prototypes that want method_missing stubs to be added.
  //
  // @default [Prototype List] BasicObject_alloc.prototype
  //
  Opal.stub_subscribers = [BasicObject_alloc.prototype];

  // Add a method_missing stub function to the given prototype for the
  // given name.
  //
  // @param prototype [Prototype] the target prototype
  // @param stub [String] stub name to add (e.g. "$foo")
  // @return [undefined]
  Opal.add_stub_for = function(prototype, stub) {
    var method_missing_stub = Opal.stub_for(stub);
    prototype[stub] = method_missing_stub;
  };

  // Generate the method_missing stub for a given method name.
  //
  // @param method_name [String] The js-name of the method to stub (e.g. "$foo")
  // @return [undefined]
  Opal.stub_for = function(method_name) {
    function method_missing_stub() {
      // Copy any given block onto the method_missing dispatcher
      this.$method_missing.$$p = method_missing_stub.$$p;

      // Set block property to null ready for the next call (stop false-positives)
      method_missing_stub.$$p = null;

      // call method missing with correct args (remove '$' prefix on method name)
      var args_ary = new Array(arguments.length);
      for(var i = 0, l = args_ary.length; i < l; i++) { args_ary[i] = arguments[i]; }

      return this.$method_missing.apply(this, [method_name.slice(1)].concat(args_ary));
    }

    method_missing_stub.$$stub = true;

    return method_missing_stub;
  };


  // Methods
  // -------

  // Arity count error dispatcher for methods
  //
  // @param actual [Fixnum] number of arguments given to method
  // @param expected [Fixnum] expected number of arguments
  // @param object [Object] owner of the method +meth+
  // @param meth [String] method name that got wrong number of arguments
  // @raise [ArgumentError]
  Opal.ac = function(actual, expected, object, meth) {
    var inspect = '';
    if (object.$$is_class || object.$$is_module) {
      inspect += object.$$name + '.';
    }
    else {
      inspect += object.$$class.$$name + '#';
    }
    inspect += meth;

    throw Opal.ArgumentError.$new('[' + inspect + '] wrong number of arguments(' + actual + ' for ' + expected + ')');
  };

  // Arity count error dispatcher for blocks
  //
  // @param actual [Fixnum] number of arguments given to block
  // @param expected [Fixnum] expected number of arguments
  // @param context [Object] context of the block definition
  // @raise [ArgumentError]
  Opal.block_ac = function(actual, expected, context) {
    var inspect = "`block in " + context + "'";

    throw Opal.ArgumentError.$new(inspect + ': wrong number of arguments (' + actual + ' for ' + expected + ')');
  };

  // Super dispatcher
  Opal.find_super_dispatcher = function(obj, mid, current_func, defcheck, defs) {
    var dispatcher, super_method;

    if (defs) {
      if (obj.$$is_class || obj.$$is_module) {
        dispatcher = defs.$$super;
      }
      else {
        dispatcher = obj.$$class.$$proto;
      }
    }
    else {
      dispatcher = Opal.find_obj_super_dispatcher(obj, mid, current_func);
    }

    super_method = dispatcher['$' + mid];

    if (!defcheck && super_method.$$stub && Opal.Kernel.$method_missing === obj.$method_missing) {
      // method_missing hasn't been explicitly defined
      throw Opal.NoMethodError.$new('super: no superclass method `'+mid+"' for "+obj, mid);
    }

    return super_method;
  };

  // Iter dispatcher for super in a block
  Opal.find_iter_super_dispatcher = function(obj, jsid, current_func, defcheck, implicit) {
    var call_jsid = jsid;

    if (!current_func) {
      throw Opal.RuntimeError.$new("super called outside of method");
    }

    if (implicit && current_func.$$define_meth) {
      throw Opal.RuntimeError.$new("implicit argument passing of super from method defined by define_method() is not supported. Specify all arguments explicitly");
    }

    if (current_func.$$def) {
      call_jsid = current_func.$$jsid;
    }

    return Opal.find_super_dispatcher(obj, call_jsid, current_func, defcheck);
  };

  Opal.find_obj_super_dispatcher = function(obj, mid, current_func) {
    var klass = obj.$$meta || obj.$$class;

    // first we need to find the class/module current_func is located on
    klass = Opal.find_owning_class(klass, current_func);

    if (!klass) {
      throw new Error("could not find current class for super()");
    }

    return Opal.find_super_func(klass, '$' + mid, current_func);
  };

  Opal.find_owning_class = function(klass, current_func) {
    var owner = current_func.$$owner;

    while (klass) {
      // repeating for readability

      if (klass.$$iclass && klass.$$module === current_func.$$donated) {
        // this klass was the last one the module donated to
        // case is also hit with multiple module includes
        break;
      }
      else if (klass.$$iclass && klass.$$module === owner) {
        // module has donated to other classes but klass isn't one of those
        break;
      }
      else if (owner.$$is_singleton && klass === owner.$$singleton_of.$$class) {
        // cases like stdlib `Singleton::included` that use a singleton of a singleton
        break;
      }
      else if (klass === owner) {
        // no modules, pure class inheritance
        break;
      }

      klass = klass.$$parent;
    }

    return klass;
  };

  Opal.find_super_func = function(owning_klass, jsid, current_func) {
    var klass = owning_klass.$$parent;

    // now we can find the super
    while (klass) {
      var working = klass.$$proto[jsid];

      if (working && working !== current_func) {
        // ok
        break;
      }

      klass = klass.$$parent;
    }

    return klass.$$proto;
  };

  // Used to return as an expression. Sometimes, we can't simply return from
  // a javascript function as if we were a method, as the return is used as
  // an expression, or even inside a block which must "return" to the outer
  // method. This helper simply throws an error which is then caught by the
  // method. This approach is expensive, so it is only used when absolutely
  // needed.
  //
  Opal.ret = function(val) {
    Opal.returner.$v = val;
    throw Opal.returner;
  };

  // Used to break out of a block.
  Opal.brk = function(val, breaker) {
    breaker.$v = val;
    throw breaker;
  };

  // Builds a new unique breaker, this is to avoid multiple nested breaks to get
  // in the way of each other.
  Opal.new_brk = function() {
    return new Error('unexpected break');
  };

  // handles yield calls for 1 yielded arg
  Opal.yield1 = function(block, arg) {
    if (typeof(block) !== "function") {
      throw Opal.LocalJumpError.$new("no block given");
    }

    var has_mlhs = block.$$has_top_level_mlhs_arg,
        has_trailing_comma = block.$$has_trailing_comma_in_args;

    if (block.length > 1 || ((has_mlhs || has_trailing_comma) && block.length === 1)) {
      arg = Opal.to_ary(arg);
    }

    if ((block.length > 1 || (has_trailing_comma && block.length === 1)) && arg.$$is_array) {
      return block.apply(null, arg);
    }
    else {
      return block(arg);
    }
  };

  // handles yield for > 1 yielded arg
  Opal.yieldX = function(block, args) {
    if (typeof(block) !== "function") {
      throw Opal.LocalJumpError.$new("no block given");
    }

    if (block.length > 1 && args.length === 1) {
      if (args[0].$$is_array) {
        return block.apply(null, args[0]);
      }
    }

    if (!args.$$is_array) {
      var args_ary = new Array(args.length);
      for(var i = 0, l = args_ary.length; i < l; i++) { args_ary[i] = args[i]; }

      return block.apply(null, args_ary);
    }

    return block.apply(null, args);
  };

  // Finds the corresponding exception match in candidates.  Each candidate can
  // be a value, or an array of values.  Returns null if not found.
  Opal.rescue = function(exception, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];

      if (candidate.$$is_array) {
        var result = Opal.rescue(exception, candidate);

        if (result) {
          return result;
        }
      }
      else if (candidate === Opal.JS.Error) {
        return candidate;
      }
      else if (candidate['$==='](exception)) {
        return candidate;
      }
    }

    return null;
  };

  Opal.is_a = function(object, klass) {
    if (object.$$meta === klass || object.$$class === klass) {
      return true;
    }

    if (object.$$is_number && klass.$$is_number_class ) {
      return true;
    }

    var i, length, ancestors = Opal.ancestors(object.$$is_class ? Opal.get_singleton_class(object) : (object.$$meta || object.$$class));

    for (i = 0, length = ancestors.length; i < length; i++) {
      if (ancestors[i] === klass) {
        return true;
      }
    }

    return false;
  };

  // Helpers for extracting kwsplats
  // Used for: { **h }
  Opal.to_hash = function(value) {
    if (value.$$is_hash) {
      return value;
    }
    else if (value['$respond_to?']('to_hash', true)) {
      var hash = value.$to_hash();
      if (hash.$$is_hash) {
        return hash;
      }
      else {
        throw Opal.TypeError.$new("Can't convert " + value.$$class +
          " to Hash (" + value.$$class + "#to_hash gives " + hash.$$class + ")");
      }
    }
    else {
      throw Opal.TypeError.$new("no implicit conversion of " + value.$$class + " into Hash");
    }
  };

  // Helpers for implementing multiple assignment
  // Our code for extracting the values and assigning them only works if the
  // return value is a JS array.
  // So if we get an Array subclass, extract the wrapped JS array from it

  // Used for: a, b = something (no splat)
  Opal.to_ary = function(value) {
    if (value.$$is_array) {
      return value;
    }
    else if (value['$respond_to?']('to_ary', true)) {
      var ary = value.$to_ary();
      if (ary === nil) {
        return [value];
      }
      else if (ary.$$is_array) {
        return ary;
      }
      else {
        throw Opal.TypeError.$new("Can't convert " + value.$$class +
          " to Array (" + value.$$class + "#to_ary gives " + ary.$$class + ")");
      }
    }
    else {
      return [value];
    }
  };

  // Used for: a, b = *something (with splat)
  Opal.to_a = function(value) {
    if (value.$$is_array) {
      // A splatted array must be copied
      return value.slice();
    }
    else if (value['$respond_to?']('to_a', true)) {
      var ary = value.$to_a();
      if (ary === nil) {
        return [value];
      }
      else if (ary.$$is_array) {
        return ary;
      }
      else {
        throw Opal.TypeError.$new("Can't convert " + value.$$class +
          " to Array (" + value.$$class + "#to_a gives " + ary.$$class + ")");
      }
    }
    else {
      return [value];
    }
  };

  // Used for extracting keyword arguments from arguments passed to
  // JS function. If provided +arguments+ list doesn't have a Hash
  // as a last item, returns a blank Hash.
  //
  // @param parameters [Array]
  // @return [Hash]
  //
  Opal.extract_kwargs = function(parameters) {
    var kwargs = parameters[parameters.length - 1];
    if (kwargs != null && kwargs['$respond_to?']('to_hash', true)) {
      Array.prototype.splice.call(parameters, parameters.length - 1, 1);
      return kwargs.$to_hash();
    }
    else {
      return Opal.hash2([], {});
    }
  }

  // Used to get a list of rest keyword arguments. Method takes the given
  // keyword args, i.e. the hash literal passed to the method containing all
  // keyword arguemnts passed to method, as well as the used args which are
  // the names of required and optional arguments defined. This method then
  // just returns all key/value pairs which have not been used, in a new
  // hash literal.
  //
  // @param given_args [Hash] all kwargs given to method
  // @param used_args [Object<String: true>] all keys used as named kwargs
  // @return [Hash]
  //
  Opal.kwrestargs = function(given_args, used_args) {
    var keys      = [],
        map       = {},
        key       = null,
        given_map = given_args.$$smap;

    for (key in given_map) {
      if (!used_args[key]) {
        keys.push(key);
        map[key] = given_map[key];
      }
    }

    return Opal.hash2(keys, map);
  };

  // Calls passed method on a ruby object with arguments and block:
  //
  // Can take a method or a method name.
  //
  // 1. When method name gets passed it invokes it by its name
  //    and calls 'method_missing' when object doesn't have this method.
  //    Used internally by Opal to invoke method that takes a block or a splat.
  // 2. When method (i.e. method body) gets passed, it doesn't trigger 'method_missing'
  //    because it doesn't know the name of the actual method.
  //    Used internally by Opal to invoke 'super'.
  //
  // @example
  //   var my_array = [1, 2, 3, 4]
  //   Opal.send(my_array, 'length')                    # => 4
  //   Opal.send(my_array, my_array.$length)            # => 4
  //
  //   Opal.send(my_array, 'reverse!')                  # => [4, 3, 2, 1]
  //   Opal.send(my_array, my_array['$reverse!']')      # => [4, 3, 2, 1]
  //
  // @param recv [Object] ruby object
  // @param method [Function, String] method body or name of the method
  // @param args [Array] arguments that will be passed to the method call
  // @param block [Function] ruby block
  // @return [Object] returning value of the method call
  Opal.send = function(recv, method, args, block) {
    if (typeof(method) === 'string') {
      var method_name = method;
      method = recv['$' + method_name];

      if (method) {
        method.$$p = block;
        return method.apply(recv, args);
      }

      return recv.$method_missing.apply(recv, [method_name].concat(args));
    } else if (typeof(method) === 'function') {
      method.$$p = block;
      return method.apply(recv, args);
    }
  }

  // Used to define methods on an object. This is a helper method, used by the
  // compiled source to define methods on special case objects when the compiler
  // can not determine the destination object, or the object is a Module
  // instance. This can get called by `Module#define_method` as well.
  //
  // ## Modules
  //
  // Any method defined on a module will come through this runtime helper.
  // The method is added to the module body, and the owner of the method is
  // set to be the module itself. This is used later when choosing which
  // method should show on a class if more than 1 included modules define
  // the same method. Finally, if the module is in `module_function` mode,
  // then the method is also defined onto the module itself.
  //
  // ## Classes
  //
  // This helper will only be called for classes when a method is being
  // defined indirectly; either through `Module#define_method`, or by a
  // literal `def` method inside an `instance_eval` or `class_eval` body. In
  // either case, the method is simply added to the class' prototype. A special
  // exception exists for `BasicObject` and `Object`. These two classes are
  // special because they are used in toll-free bridged classes. In each of
  // these two cases, extra work is required to define the methods on toll-free
  // bridged class' prototypes as well.
  //
  // ## Objects
  //
  // If a simple ruby object is the object, then the method is simply just
  // defined on the object as a singleton method. This would be the case when
  // a method is defined inside an `instance_eval` block.
  //
  // @param obj  [Object, Class] the actual obj to define method for
  // @param jsid [String] the JavaScript friendly method name (e.g. '$foo')
  // @param body [JS.Function] the literal JavaScript function used as method
  // @return [null]
  //
  Opal.def = function(obj, jsid, body) {
    // if instance_eval is invoked on a module/class, it sets inst_eval_mod
    if (!obj.$$eval && (obj.$$is_class || obj.$$is_module)) {
      Opal.defn(obj, jsid, body);
    }
    else {
      Opal.defs(obj, jsid, body);
    }
  };

  // Define method on a module or class (see Opal.def).
  Opal.defn = function(obj, jsid, body) {
    obj.$$proto[jsid] = body;
    // for super dispatcher, etc.
    body.$$owner = obj;

    // is it a module?
    if (obj.$$is_module) {
      Opal.update_includers(obj, jsid);

      if (obj.$$module_function) {
        Opal.defs(obj, jsid, body);
      }
    }

    // is it a bridged class?
    var bridged = obj.$__id__ && !obj.$__id__.$$stub && BridgedClasses[obj.$__id__()];
    if (bridged) {
      for (var i = bridged.length - 1; i >= 0; i--) {
        Opal.bridge_method(bridged[i], obj, jsid, body);
      }
    }

    // method_added/singleton_method_added hooks
    var singleton_of = obj.$$singleton_of;
    if (obj.$method_added && !obj.$method_added.$$stub && !singleton_of) {
      obj.$method_added(jsid.substr(1));
    }
    else if (singleton_of && singleton_of.$singleton_method_added && !singleton_of.$singleton_method_added.$$stub) {
      singleton_of.$singleton_method_added(jsid.substr(1));
    }

    return nil;
  };

  // Define a singleton method on the given object (see Opal.def).
  Opal.defs = function(obj, jsid, body) {
    Opal.defn(Opal.get_singleton_class(obj), jsid, body)
  };

  // Called from #remove_method.
  Opal.rdef = function(obj, jsid) {
    // TODO: remove from BridgedClasses as well

    if (!$hasOwn.call(obj.$$proto, jsid)) {
      throw Opal.NameError.$new("method '" + jsid.substr(1) + "' not defined in " + obj.$name());
    }

    delete obj.$$proto[jsid];

    if (obj.$$is_singleton) {
      if (obj.$$proto.$singleton_method_removed && !obj.$$proto.$singleton_method_removed.$$stub) {
        obj.$$proto.$singleton_method_removed(jsid.substr(1));
      }
    }
    else {
      if (obj.$method_removed && !obj.$method_removed.$$stub) {
        obj.$method_removed(jsid.substr(1));
      }
    }
  };

  // Called from #undef_method.
  Opal.udef = function(obj, jsid) {
    if (!obj.$$proto[jsid] || obj.$$proto[jsid].$$stub) {
      throw Opal.NameError.$new("method '" + jsid.substr(1) + "' not defined in " + obj.$name());
    }

    Opal.add_stub_for(obj.$$proto, jsid);

    if (obj.$$is_singleton) {
      if (obj.$$proto.$singleton_method_undefined && !obj.$$proto.$singleton_method_undefined.$$stub) {
        obj.$$proto.$singleton_method_undefined(jsid.substr(1));
      }
    }
    else {
      if (obj.$method_undefined && !obj.$method_undefined.$$stub) {
        obj.$method_undefined(jsid.substr(1));
      }
    }
  };

  Opal.alias = function(obj, name, old) {
    var id     = '$' + name,
        old_id = '$' + old,
        body   = obj.$$proto['$' + old],
        new_body;

    // instance_eval is being run on a class/module, so that need to alias class methods
    if (obj.$$eval) {
      return Opal.alias(Opal.get_singleton_class(obj), name, old);
    }

    if (typeof(body) !== "function" || body.$$stub) {
      var ancestor = obj.$$super;

      while (typeof(body) !== "function" && ancestor) {
        body     = ancestor[old_id];
        ancestor = ancestor.$$super;
      }

      if (typeof(body) !== "function" || body.$$stub) {
        throw Opal.NameError.$new("undefined method `" + old + "' for class `" + obj.$name() + "'")
      }
    }

    new_body = function() {
      body.$$p = new_body.$$p;
      new_body.$$p = null;
      return body.apply(this, arguments);
    };

    new_body.length = body.length;
    new_body.$$arity = body.$$arity;
    new_body.$$parameters = body.$$parameters;
    new_body.$$source_location = body.$$source_location;
    new_body.$$alias_of = body;
    new_body.$$alias_name = name;

    Opal.defn(obj, id, new_body);

    return obj;
  };

  Opal.alias_native = function(obj, name, native_name) {
    var id   = '$' + name,
        body = obj.$$proto[native_name];

    if (typeof(body) !== "function" || body.$$stub) {
      throw Opal.NameError.$new("undefined native method `" + native_name + "' for class `" + obj.$name() + "'")
    }

    Opal.defn(obj, id, body);

    return obj;
  };


  // Hashes
  // ------

  Opal.hash_init = function(hash) {
    hash.$$smap = Object.create(null);
    hash.$$map  = Object.create(null);
    hash.$$keys = [];
  };

  Opal.hash_clone = function(from_hash, to_hash) {
    to_hash.$$none = from_hash.$$none;
    to_hash.$$proc = from_hash.$$proc;

    for (var i = 0, keys = from_hash.$$keys, length = keys.length, key, value; i < length; i++) {
      key = from_hash.$$keys[i];

      if (key.$$is_string) {
        value = from_hash.$$smap[key];
      } else {
        value = key.value;
        key = key.key;
      }

      Opal.hash_put(to_hash, key, value);
    }
  };

  Opal.hash_put = function(hash, key, value) {
    if (key.$$is_string) {
      if (!$hasOwn.call(hash.$$smap, key)) {
        hash.$$keys.push(key);
      }
      hash.$$smap[key] = value;
      return;
    }

    var key_hash = key.$hash(), bucket, last_bucket;

    if (!$hasOwn.call(hash.$$map, key_hash)) {
      bucket = {key: key, key_hash: key_hash, value: value};
      hash.$$keys.push(bucket);
      hash.$$map[key_hash] = bucket;
      return;
    }

    bucket = hash.$$map[key_hash];

    while (bucket) {
      if (key === bucket.key || key['$eql?'](bucket.key)) {
        last_bucket = undefined;
        bucket.value = value;
        break;
      }
      last_bucket = bucket;
      bucket = bucket.next;
    }

    if (last_bucket) {
      bucket = {key: key, key_hash: key_hash, value: value};
      hash.$$keys.push(bucket);
      last_bucket.next = bucket;
    }
  };

  Opal.hash_get = function(hash, key) {
    if (key.$$is_string) {
      if ($hasOwn.call(hash.$$smap, key)) {
        return hash.$$smap[key];
      }
      return;
    }

    var key_hash = key.$hash(), bucket;

    if ($hasOwn.call(hash.$$map, key_hash)) {
      bucket = hash.$$map[key_hash];

      while (bucket) {
        if (key === bucket.key || key['$eql?'](bucket.key)) {
          return bucket.value;
        }
        bucket = bucket.next;
      }
    }
  };

  Opal.hash_delete = function(hash, key) {
    var i, keys = hash.$$keys, length = keys.length, value;

    if (key.$$is_string) {
      if (!$hasOwn.call(hash.$$smap, key)) {
        return;
      }

      for (i = 0; i < length; i++) {
        if (keys[i] === key) {
          keys.splice(i, 1);
          break;
        }
      }

      value = hash.$$smap[key];
      delete hash.$$smap[key];
      return value;
    }

    var key_hash = key.$hash();

    if (!$hasOwn.call(hash.$$map, key_hash)) {
      return;
    }

    var bucket = hash.$$map[key_hash], last_bucket;

    while (bucket) {
      if (key === bucket.key || key['$eql?'](bucket.key)) {
        value = bucket.value;

        for (i = 0; i < length; i++) {
          if (keys[i] === bucket) {
            keys.splice(i, 1);
            break;
          }
        }

        if (last_bucket && bucket.next) {
          last_bucket.next = bucket.next;
        }
        else if (last_bucket) {
          delete last_bucket.next;
        }
        else if (bucket.next) {
          hash.$$map[key_hash] = bucket.next;
        }
        else {
          delete hash.$$map[key_hash];
        }

        return value;
      }
      last_bucket = bucket;
      bucket = bucket.next;
    }
  };

  Opal.hash_rehash = function(hash) {
    for (var i = 0, length = hash.$$keys.length, key_hash, bucket, last_bucket; i < length; i++) {

      if (hash.$$keys[i].$$is_string) {
        continue;
      }

      key_hash = hash.$$keys[i].key.$hash();

      if (key_hash === hash.$$keys[i].key_hash) {
        continue;
      }

      bucket = hash.$$map[hash.$$keys[i].key_hash];
      last_bucket = undefined;

      while (bucket) {
        if (bucket === hash.$$keys[i]) {
          if (last_bucket && bucket.next) {
            last_bucket.next = bucket.next;
          }
          else if (last_bucket) {
            delete last_bucket.next;
          }
          else if (bucket.next) {
            hash.$$map[hash.$$keys[i].key_hash] = bucket.next;
          }
          else {
            delete hash.$$map[hash.$$keys[i].key_hash];
          }
          break;
        }
        last_bucket = bucket;
        bucket = bucket.next;
      }

      hash.$$keys[i].key_hash = key_hash;

      if (!$hasOwn.call(hash.$$map, key_hash)) {
        hash.$$map[key_hash] = hash.$$keys[i];
        continue;
      }

      bucket = hash.$$map[key_hash];
      last_bucket = undefined;

      while (bucket) {
        if (bucket === hash.$$keys[i]) {
          last_bucket = undefined;
          break;
        }
        last_bucket = bucket;
        bucket = bucket.next;
      }

      if (last_bucket) {
        last_bucket.next = hash.$$keys[i];
      }
    }
  };

  Opal.hash = function() {
    var arguments_length = arguments.length, args, hash, i, length, key, value;

    if (arguments_length === 1 && arguments[0].$$is_hash) {
      return arguments[0];
    }

    hash = new Opal.Hash.$$alloc();
    Opal.hash_init(hash);

    if (arguments_length === 1 && arguments[0].$$is_array) {
      args = arguments[0];
      length = args.length;

      for (i = 0; i < length; i++) {
        if (args[i].length !== 2) {
          throw Opal.ArgumentError.$new("value not of length 2: " + args[i].$inspect());
        }

        key = args[i][0];
        value = args[i][1];

        Opal.hash_put(hash, key, value);
      }

      return hash;
    }

    if (arguments_length === 1) {
      args = arguments[0];
      for (key in args) {
        if (args.hasOwnProperty(key)) {
          value = args[key];

          Opal.hash_put(hash, key, value);
        }
      }

      return hash;
    }

    if (arguments_length % 2 !== 0) {
      throw Opal.ArgumentError.$new("odd number of arguments for Hash");
    }

    for (i = 0; i < arguments_length; i += 2) {
      key = arguments[i];
      value = arguments[i + 1];

      Opal.hash_put(hash, key, value);
    }

    return hash;
  };

  // A faster Hash creator for hashes that just use symbols and
  // strings as keys. The map and keys array can be constructed at
  // compile time, so they are just added here by the constructor
  // function.
  //
  Opal.hash2 = function(keys, smap) {
    var hash = new Opal.Hash.$$alloc();

    hash.$$smap = smap;
    hash.$$map  = Object.create(null);
    hash.$$keys = keys;

    return hash;
  };

  // Create a new range instance with first and last values, and whether the
  // range excludes the last value.
  //
  Opal.range = function(first, last, exc) {
    var range         = new Opal.Range.$$alloc();
        range.begin   = first;
        range.end     = last;
        range.exclude = exc;

    return range;
  };

  // Get the ivar name for a given name.
  // Mostly adds a trailing $ to reserved names.
  //
  Opal.ivar = function(name) {
    if (
        // properties
        name === "constructor" ||
        name === "displayName" ||
        name === "__count__" ||
        name === "__noSuchMethod__" ||
        name === "__parent__" ||
        name === "__proto__" ||

        // methods
        name === "hasOwnProperty" ||
        name === "valueOf"
       )
    {
      return name + "$";
    }

    return name;
  };


  // Regexps
  // -------

  // Escape Regexp special chars letting the resulting string be used to build
  // a new Regexp.
  //
  Opal.escape_regexp = function(str) {
    return str.replace(/([-[\]\/{}()*+?.^$\\| ])/g, '\\$1')
              .replace(/[\n]/g, '\\n')
              .replace(/[\r]/g, '\\r')
              .replace(/[\f]/g, '\\f')
              .replace(/[\t]/g, '\\t');
  }


  // Require system
  // --------------

  Opal.modules         = {};
  Opal.loaded_features = ['corelib/runtime'];
  Opal.current_dir     = '.'
  Opal.require_table   = {'corelib/runtime': true};

  Opal.normalize = function(path) {
    var parts, part, new_parts = [], SEPARATOR = '/';

    if (Opal.current_dir !== '.') {
      path = Opal.current_dir.replace(/\/*$/, '/') + path;
    }

    path = path.replace(/\.(rb|opal|js)$/, '');
    parts = path.split(SEPARATOR);

    for (var i = 0, ii = parts.length; i < ii; i++) {
      part = parts[i];
      if (part === '') continue;
      (part === '..') ? new_parts.pop() : new_parts.push(part)
    }

    return new_parts.join(SEPARATOR);
  };

  Opal.loaded = function(paths) {
    var i, l, path;

    for (i = 0, l = paths.length; i < l; i++) {
      path = Opal.normalize(paths[i]);

      if (Opal.require_table[path]) {
        return;
      }

      Opal.loaded_features.push(path);
      Opal.require_table[path] = true;
    }
  };

  Opal.load = function(path) {
    path = Opal.normalize(path);

    Opal.loaded([path]);

    var module = Opal.modules[path];

    if (module) {
      module(Opal);
    }
    else {
      var severity = Opal.config.missing_require_severity;
      var message  = 'cannot load such file -- ' + path;

      if (severity === "error") {
        Opal.LoadError ? Opal.LoadError.$new(message) : function(){throw message}();
      }
      else if (severity === "warning") {
        console.warn('WARNING: LoadError: ' + message);
      }
    }

    return true;
  };

  Opal.require = function(path) {
    path = Opal.normalize(path);

    if (Opal.require_table[path]) {
      return false;
    }

    return Opal.load(path);
  };


  // Initialization
  // --------------

  // Constructors for *instances* of core objects
  Opal.boot_class_alloc('BasicObject', BasicObject_alloc);
  Opal.boot_class_alloc('Object',      Object_alloc,       BasicObject_alloc);
  Opal.boot_class_alloc('Module',      Module_alloc,       Object_alloc);
  Opal.boot_class_alloc('Class',       Class_alloc,        Module_alloc);

  // Constructors for *classes* of core objects
  Opal.BasicObject = BasicObject = Opal.setup_class_object('BasicObject', BasicObject_alloc, 'Class',       Class_alloc);
  Opal.Object      = _Object     = Opal.setup_class_object('Object',      Object_alloc,      'BasicObject', BasicObject.constructor);
  Opal.Module      = Module      = Opal.setup_class_object('Module',      Module_alloc,      'Object',      _Object.constructor);
  Opal.Class       = Class       = Opal.setup_class_object('Class',       Class_alloc,       'Module',      Module.constructor);

  Opal.constants.push("BasicObject");
  Opal.constants.push("Object");
  Opal.constants.push("Module");
  Opal.constants.push("Class");

  // Fix booted classes to use their metaclass
  BasicObject.$$class = Class;
  _Object.$$class     = Class;
  Module.$$class      = Class;
  Class.$$class       = Class;

  // Fix superclasses of booted classes
  BasicObject.$$super = null;
  _Object.$$super     = BasicObject;
  Module.$$super      = _Object;
  Class.$$super       = Module;

  BasicObject.$$parent = null;
  _Object.$$parent     = BasicObject;
  Module.$$parent      = _Object;
  Class.$$parent       = Module;

  Opal.base                = _Object;
  BasicObject.$$scope      = _Object.$$scope = Opal;
  BasicObject.$$orig_scope = _Object.$$orig_scope = Opal;

  Module.$$scope      = _Object.$$scope;
  Module.$$orig_scope = _Object.$$orig_scope;
  Class.$$scope       = _Object.$$scope;
  Class.$$orig_scope  = _Object.$$orig_scope;

  // Forward .toString() to #to_s
  _Object.$$proto.toString = function() {
    return this.$to_s();
  };

  // Make Kernel#require immediately available as it's needed to require all the
  // other corelib files.
  _Object.$$proto.$require = Opal.require;

  // Instantiate the top object
  Opal.top = new _Object.$$alloc();

  // Nil
  Opal.klass(_Object, _Object, 'NilClass', NilClass_alloc);
  nil = Opal.nil = new NilClass_alloc();
  nil.$$id = nil_id;
  nil.call = nil.apply = function() { throw Opal.LocalJumpError.$new('no block given'); };
  Opal.breaker  = new Error('unexpected break (old)');
  Opal.returner = new Error('unexpected return');

  TypeError.$$super = Error;
}).call(this);
Opal.loaded(["corelib/runtime"]);
/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/helpers"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$new', '$class', '$===', '$respond_to?', '$raise', '$type_error', '$__send__', '$coerce_to', '$nil?', '$<=>', '$inspect', '$coerce_to!', '$!=', '$[]', '$upcase']);
  return (function($base, $visibility_scopes) {
    var $Opal, self = $Opal = $module($base, 'Opal');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Opal_bridge_1, TMP_Opal_type_error_2, TMP_Opal_coerce_to_3, TMP_Opal_coerce_to$B_4, TMP_Opal_coerce_to$q_5, TMP_Opal_try_convert_6, TMP_Opal_compare_7, TMP_Opal_destructure_8, TMP_Opal_respond_to$q_9, TMP_Opal_inspect_10, TMP_Opal_instance_variable_name$B_11, TMP_Opal_class_variable_name$B_12, TMP_Opal_const_name$B_13, TMP_Opal_pristine_14;

    
    Opal.defs(self, '$bridge', TMP_Opal_bridge_1 = function $$bridge(klass, constructor) {
      var self = this;

      return Opal.bridge(klass, constructor)
    }, TMP_Opal_bridge_1.$$arity = 2);
    Opal.defs(self, '$type_error', TMP_Opal_type_error_2 = function $$type_error(object, type, method, coerced) {
      var $a, $b, self = this;

      if (method == null) {
        method = nil;
      }
      if (coerced == null) {
        coerced = nil;
      }
      if ((($a = (($b = method !== false && method !== nil && method != null) ? coerced : method)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Opal.const_get($scopes, 'TypeError', true, true).$new("" + "can't convert " + (object.$class()) + " into " + (type) + " (" + (object.$class()) + "#" + (method) + " gives " + (coerced.$class()))
        } else {
        return Opal.const_get($scopes, 'TypeError', true, true).$new("" + "no implicit conversion of " + (object.$class()) + " into " + (type))
      }
    }, TMP_Opal_type_error_2.$$arity = -3);
    Opal.defs(self, '$coerce_to', TMP_Opal_coerce_to_3 = function $$coerce_to(object, type, method) {
      var $a, self = this;

      
      if ((($a = type['$==='](object)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return object};
      if ((($a = object['$respond_to?'](method)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(self.$type_error(object, type))
      };
      return object.$__send__(method);
    }, TMP_Opal_coerce_to_3.$$arity = 3);
    Opal.defs(self, '$coerce_to!', TMP_Opal_coerce_to$B_4 = function(object, type, method) {
      var $a, self = this, coerced = nil;

      
      coerced = self.$coerce_to(object, type, method);
      if ((($a = type['$==='](coerced)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(self.$type_error(object, type, method, coerced))
      };
      return coerced;
    }, TMP_Opal_coerce_to$B_4.$$arity = 3);
    Opal.defs(self, '$coerce_to?', TMP_Opal_coerce_to$q_5 = function(object, type, method) {
      var $a, self = this, coerced = nil;

      
      if ((($a = object['$respond_to?'](method)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      coerced = self.$coerce_to(object, type, method);
      if ((($a = coerced['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if ((($a = type['$==='](coerced)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(self.$type_error(object, type, method, coerced))
      };
      return coerced;
    }, TMP_Opal_coerce_to$q_5.$$arity = 3);
    Opal.defs(self, '$try_convert', TMP_Opal_try_convert_6 = function $$try_convert(object, type, method) {
      var $a, self = this;

      
      if ((($a = type['$==='](object)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return object};
      if ((($a = object['$respond_to?'](method)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return object.$__send__(method)
        } else {
        return nil
      };
    }, TMP_Opal_try_convert_6.$$arity = 3);
    Opal.defs(self, '$compare', TMP_Opal_compare_7 = function $$compare(a, b) {
      var $a, self = this, compare = nil;

      
      compare = a['$<=>'](b);
      if ((($a = compare === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (a.$class()) + " with " + (b.$class()) + " failed")};
      return compare;
    }, TMP_Opal_compare_7.$$arity = 2);
    Opal.defs(self, '$destructure', TMP_Opal_destructure_8 = function $$destructure(args) {
      var self = this;

      
      if (args.length == 1) {
        return args[0];
      }
      else if (args.$$is_array) {
        return args;
      }
      else {
        var args_ary = new Array(args.length);
        for(var i = 0, l = args_ary.length; i < l; i++) { args_ary[i] = args[i]; }

        return args_ary;
      }
    
    }, TMP_Opal_destructure_8.$$arity = 1);
    Opal.defs(self, '$respond_to?', TMP_Opal_respond_to$q_9 = function(obj, method) {
      var self = this;

      
      
      if (obj == null || !obj.$$class) {
        return false;
      }
    ;
      return obj['$respond_to?'](method);
    }, TMP_Opal_respond_to$q_9.$$arity = 2);
    Opal.defs(self, '$inspect', TMP_Opal_inspect_10 = function $$inspect(obj) {
      var self = this;

      
      if (obj === undefined) {
        return "undefined";
      }
      else if (obj === null) {
        return "null";
      }
      else if (!obj.$$class) {
        return obj.toString();
      }
      else {
        return obj.$inspect();
      }
    
    }, TMP_Opal_inspect_10.$$arity = 1);
    Opal.defs(self, '$instance_variable_name!', TMP_Opal_instance_variable_name$B_11 = function(name) {
      var $a, self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](name, Opal.const_get($scopes, 'String', true, true), "to_str");
      if ((($a = /^@[a-zA-Z_][a-zA-Z0-9_]*?$/.test(name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "'" + (name) + "' is not allowed as an instance variable name", name))
      };
      return name;
    }, TMP_Opal_instance_variable_name$B_11.$$arity = 1);
    Opal.defs(self, '$class_variable_name!', TMP_Opal_class_variable_name$B_12 = function(name) {
      var $a, self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](name, Opal.const_get($scopes, 'String', true, true), "to_str");
      if ((($a = name.length < 3 || name.slice(0,2) !== '@@') !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "`" + (name) + "' is not allowed as a class variable name", name))};
      return name;
    }, TMP_Opal_class_variable_name$B_12.$$arity = 1);
    Opal.defs(self, '$const_name!', TMP_Opal_const_name$B_13 = function(const_name) {
      var $a, self = this;

      
      const_name = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](const_name, Opal.const_get($scopes, 'String', true, true), "to_str");
      if ((($a = const_name['$[]'](0)['$!='](const_name['$[]'](0).$upcase())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true), "" + "wrong constant name " + (const_name))};
      return const_name;
    }, TMP_Opal_const_name$B_13.$$arity = 1);
    Opal.defs(self, '$pristine', TMP_Opal_pristine_14 = function $$pristine(owner_class, $a_rest) {
      var self = this, method_names;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      method_names = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        method_names[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      
      var method_name;
      for (var i = method_names.length - 1; i >= 0; i--) {
        method_name = method_names[i];
        owner_class.$$proto['$'+method_name].$$pristine = true
      }
    ;
      return nil;
    }, TMP_Opal_pristine_14.$$arity = -2);
  })($scope.base, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/module"] = function(Opal) {
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send, $range = Opal.range, $hash2 = Opal.hash2;

  Opal.add_stubs(['$===', '$raise', '$equal?', '$<', '$>', '$nil?', '$attr_reader', '$attr_writer', '$class_variable_name!', '$new', '$const_name!', '$=~', '$inject', '$split', '$const_get', '$==', '$!', '$start_with?', '$to_proc', '$lambda', '$bind', '$call', '$class', '$append_features', '$included', '$name', '$cover?', '$size', '$merge', '$compile', '$proc', '$to_s', '$__id__', '$constants', '$include?', '$copy_class_variables', '$copy_constants']);
  return (function($base, $super, $visibility_scopes) {
    function $Module(){};
    var self = $Module = $klass($base, $super, 'Module', $Module);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Module_allocate_1, TMP_Module_initialize_2, TMP_Module_$eq$eq$eq_3, TMP_Module_$lt_4, TMP_Module_$lt$eq_5, TMP_Module_$gt_6, TMP_Module_$gt$eq_7, TMP_Module_$lt$eq$gt_8, TMP_Module_alias_method_9, TMP_Module_alias_native_10, TMP_Module_ancestors_11, TMP_Module_append_features_12, TMP_Module_attr_accessor_13, TMP_Module_attr_reader_14, TMP_Module_attr_writer_15, TMP_Module_autoload_16, TMP_Module_class_variables_17, TMP_Module_class_variable_get_18, TMP_Module_class_variable_set_19, TMP_Module_class_variable_defined$q_20, TMP_Module_remove_class_variable_21, TMP_Module_constants_22, TMP_Module_const_defined$q_23, TMP_Module_const_get_25, TMP_Module_const_missing_26, TMP_Module_const_set_27, TMP_Module_public_constant_28, TMP_Module_define_method_29, TMP_Module_remove_method_31, TMP_Module_singleton_class$q_32, TMP_Module_include_33, TMP_Module_included_modules_34, TMP_Module_include$q_35, TMP_Module_instance_method_36, TMP_Module_instance_methods_37, TMP_Module_included_38, TMP_Module_extended_39, TMP_Module_method_added_40, TMP_Module_method_removed_41, TMP_Module_method_undefined_42, TMP_Module_module_eval_43, TMP_Module_module_exec_45, TMP_Module_method_defined$q_46, TMP_Module_module_function_47, TMP_Module_name_48, TMP_Module_remove_const_49, TMP_Module_to_s_50, TMP_Module_undef_method_51, TMP_Module_instance_variables_52, TMP_Module_dup_53, TMP_Module_copy_class_variables_54, TMP_Module_copy_constants_55;

    
    Opal.defs(self, '$allocate', TMP_Module_allocate_1 = function $$allocate() {
      var self = this;

      
      var module;

      module = Opal.module_allocate(self);
      Opal.create_scope(Opal.Module.$$scope, module, null);
      return module;
    
    }, TMP_Module_allocate_1.$$arity = 0);
    Opal.defn(self, '$initialize', TMP_Module_initialize_2 = function $$initialize() {
      var self = this, $iter = TMP_Module_initialize_2.$$p, block = $iter || nil;

      TMP_Module_initialize_2.$$p = null;
      return Opal.module_initialize(self, block)
    }, TMP_Module_initialize_2.$$arity = 0);
    Opal.defn(self, '$===', TMP_Module_$eq$eq$eq_3 = function(object) {
      var $a, self = this;

      
      if ((($a = object == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return false};
      return Opal.is_a(object, self);
    }, TMP_Module_$eq$eq$eq_3.$$arity = 1);
    Opal.defn(self, '$<', TMP_Module_$lt_4 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Module', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "compared with non class/module")
      };
      
      var working = self,
          ancestors,
          i, length;

      if (working === other) {
        return false;
      }

      for (i = 0, ancestors = Opal.ancestors(self), length = ancestors.length; i < length; i++) {
        if (ancestors[i] === other) {
          return true;
        }
      }

      for (i = 0, ancestors = Opal.ancestors(other), length = ancestors.length; i < length; i++) {
        if (ancestors[i] === self) {
          return false;
        }
      }

      return nil;
    ;
    }, TMP_Module_$lt_4.$$arity = 1);
    Opal.defn(self, '$<=', TMP_Module_$lt$eq_5 = function(other) {
      var $a, self = this;

      return ((($a = self['$equal?'](other)) !== false && $a !== nil && $a != null) ? $a : $rb_lt(self, other))
    }, TMP_Module_$lt$eq_5.$$arity = 1);
    Opal.defn(self, '$>', TMP_Module_$gt_6 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Module', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "compared with non class/module")
      };
      return $rb_lt(other, self);
    }, TMP_Module_$gt_6.$$arity = 1);
    Opal.defn(self, '$>=', TMP_Module_$gt$eq_7 = function(other) {
      var $a, self = this;

      return ((($a = self['$equal?'](other)) !== false && $a !== nil && $a != null) ? $a : $rb_gt(self, other))
    }, TMP_Module_$gt$eq_7.$$arity = 1);
    Opal.defn(self, '$<=>', TMP_Module_$lt$eq$gt_8 = function(other) {
      var $a, self = this, lt = nil;

      
      
      if (self === other) {
        return 0;
      }
    ;
      if ((($a = Opal.const_get($scopes, 'Module', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      lt = $rb_lt(self, other);
      if ((($a = lt['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      if (lt !== false && lt !== nil && lt != null) {
        return -1
        } else {
        return 1
      };
    }, TMP_Module_$lt$eq$gt_8.$$arity = 1);
    Opal.defn(self, '$alias_method', TMP_Module_alias_method_9 = function $$alias_method(newname, oldname) {
      var self = this;

      
      Opal.alias(self, newname, oldname);
      return self;
    }, TMP_Module_alias_method_9.$$arity = 2);
    Opal.defn(self, '$alias_native', TMP_Module_alias_native_10 = function $$alias_native(mid, jsid) {
      var self = this;

      if (jsid == null) {
        jsid = mid;
      }
      
      Opal.alias_native(self, mid, jsid);
      return self;
    }, TMP_Module_alias_native_10.$$arity = -2);
    Opal.defn(self, '$ancestors', TMP_Module_ancestors_11 = function $$ancestors() {
      var self = this;

      return Opal.ancestors(self)
    }, TMP_Module_ancestors_11.$$arity = 0);
    Opal.defn(self, '$append_features', TMP_Module_append_features_12 = function $$append_features(includer) {
      var self = this;

      
      Opal.append_features(self, includer);
      return self;
    }, TMP_Module_append_features_12.$$arity = 1);
    Opal.defn(self, '$attr_accessor', TMP_Module_attr_accessor_13 = function $$attr_accessor($a_rest) {
      var self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      $send(self, 'attr_reader', Opal.to_a(names));
      return $send(self, 'attr_writer', Opal.to_a(names));
    }, TMP_Module_attr_accessor_13.$$arity = -1);
    Opal.alias(self, "attr", "attr_accessor");
    Opal.defn(self, '$attr_reader', TMP_Module_attr_reader_14 = function $$attr_reader($a_rest) {
      var self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      
      var proto = self.$$proto;

      for (var i = names.length - 1; i >= 0; i--) {
        var name = names[i],
            id   = '$' + name,
            ivar = Opal.ivar(name);

        // the closure here is needed because name will change at the next
        // cycle, I wish we could use let.
        var body = (function(ivar) {
          return function() {
            if (this[ivar] == null) {
              return nil;
            }
            else {
              return this[ivar];
            }
          };
        })(ivar);

        // initialize the instance variable as nil
        proto[ivar] = nil;

        body.$$parameters = [];
        body.$$arity = 0;

        if (self.$$is_singleton) {
          proto.constructor.prototype[id] = body;
        }
        else {
          Opal.defn(self, id, body);
        }
      }
    ;
      return nil;
    }, TMP_Module_attr_reader_14.$$arity = -1);
    Opal.defn(self, '$attr_writer', TMP_Module_attr_writer_15 = function $$attr_writer($a_rest) {
      var self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      
      var proto = self.$$proto;

      for (var i = names.length - 1; i >= 0; i--) {
        var name = names[i],
            id   = '$' + name + '=',
            ivar = Opal.ivar(name);

        // the closure here is needed because name will change at the next
        // cycle, I wish we could use let.
        var body = (function(ivar){
          return function(value) {
            return this[ivar] = value;
          }
        })(ivar);

        body.$$parameters = [['req']];
        body.$$arity = 1;

        // initialize the instance variable as nil
        proto[ivar] = nil;

        if (self.$$is_singleton) {
          proto.constructor.prototype[id] = body;
        }
        else {
          Opal.defn(self, id, body);
        }
      }
    ;
      return nil;
    }, TMP_Module_attr_writer_15.$$arity = -1);
    Opal.defn(self, '$autoload', TMP_Module_autoload_16 = function $$autoload(const$, path) {
      var self = this;

      
      var autoloaders;

      if (!(autoloaders = self.$$autoload)) {
        autoloaders = self.$$autoload = {};
      }

      autoloaders[const$] = path;
      return nil;
    
    }, TMP_Module_autoload_16.$$arity = 2);
    Opal.defn(self, '$class_variables', TMP_Module_class_variables_17 = function $$class_variables() {
      var self = this;

      return Object.keys(Opal.class_variables(self))
    }, TMP_Module_class_variables_17.$$arity = 0);
    Opal.defn(self, '$class_variable_get', TMP_Module_class_variable_get_18 = function $$class_variable_get(name) {
      var self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$class_variable_name!'](name);
      
      var value = Opal.class_variables(self)[name];
      if (value == null) {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "uninitialized class variable " + (name) + " in " + (self), name))
      }
      return value;
    ;
    }, TMP_Module_class_variable_get_18.$$arity = 1);
    Opal.defn(self, '$class_variable_set', TMP_Module_class_variable_set_19 = function $$class_variable_set(name, value) {
      var self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$class_variable_name!'](name);
      return Opal.class_variable_set(self, name, value);
    }, TMP_Module_class_variable_set_19.$$arity = 2);
    Opal.defn(self, '$class_variable_defined?', TMP_Module_class_variable_defined$q_20 = function(name) {
      var self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$class_variable_name!'](name);
      return Opal.class_variables(self).hasOwnProperty(name);
    }, TMP_Module_class_variable_defined$q_20.$$arity = 1);
    Opal.defn(self, '$remove_class_variable', TMP_Module_remove_class_variable_21 = function $$remove_class_variable(name) {
      var self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$class_variable_name!'](name);
      
      if (Opal.hasOwnProperty.call(self.$$cvars, name)) {
        var value = self.$$cvars[name];
        delete self.$$cvars[name];
        return value;
      } else {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "cannot remove " + (name) + " for " + (self)))
      }
    ;
    }, TMP_Module_remove_class_variable_21.$$arity = 1);
    Opal.defn(self, '$constants', TMP_Module_constants_22 = function $$constants() {
      var self = this;

      return self.$$scope.constants.slice(0)
    }, TMP_Module_constants_22.$$arity = 0);
    Opal.defn(self, '$const_defined?', TMP_Module_const_defined$q_23 = function(name, inherit) {
      var $a, self = this;

      if (inherit == null) {
        inherit = true;
      }
      
      name = Opal.const_get($scopes, 'Opal', true, true)['$const_name!'](name);
      if ((($a = name['$=~'](Opal.const_get([Opal.const_get($scopes, 'Opal', true, true).$$scope], 'CONST_NAME_REGEXP', true, true))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "wrong constant name " + (name), name))
      };
      
      var scopes = [self.$$scope];

      if (inherit || self === Opal.Object) {
        var parent = self.$$super;

        while (parent !== Opal.BasicObject) {
          scopes.push(parent.$$scope);

          parent = parent.$$super;
        }
      }

      for (var i = 0, length = scopes.length; i < length; i++) {
        if (scopes[i].hasOwnProperty(name)) {
          return true;
        }
      }

      return false;
    ;
    }, TMP_Module_const_defined$q_23.$$arity = -2);
    Opal.defn(self, '$const_get', TMP_Module_const_get_25 = function $$const_get(name, inherit) {
      var $a, TMP_24, self = this;

      if (inherit == null) {
        inherit = true;
      }
      
      name = Opal.const_get($scopes, 'Opal', true, true)['$const_name!'](name);
      
      if (name.indexOf('::') === 0 && name !== '::'){
        name = name.slice(2);
      }
    ;
      if ((($a = name.indexOf('::') != -1 && name != '::') !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $send(name.$split("::"), 'inject', [self], (TMP_24 = function(o, c){var self = TMP_24.$$s || this;
if (o == null) o = nil;if (c == null) c = nil;
        return o.$const_get(c)}, TMP_24.$$s = self, TMP_24.$$arity = 2, TMP_24))};
      if ((($a = name['$=~'](Opal.const_get([Opal.const_get($scopes, 'Opal', true, true).$$scope], 'CONST_NAME_REGEXP', true, true))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "wrong constant name " + (name), name))
      };
      
      return Opal.const_get([self.$$scope], name, inherit, true);
    ;
    }, TMP_Module_const_get_25.$$arity = -2);
    Opal.defn(self, '$const_missing', TMP_Module_const_missing_26 = function $$const_missing(name) {
      var self = this, full_const_name = nil;

      
      
      if (self.$$autoload) {
        var file = self.$$autoload[name];

        if (file) {
          self.$require(file);

          return self.$const_get(name);
        }
      }
    ;
      full_const_name = (function() {if (self['$=='](Opal.const_get($scopes, 'Object', true, true))) {
        return name
        } else {
        return "" + (self) + "::" + (name)
      }; return nil; })();
      return self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "uninitialized constant " + (full_const_name), name));
    }, TMP_Module_const_missing_26.$$arity = 1);
    Opal.defn(self, '$const_set', TMP_Module_const_set_27 = function $$const_set(name, value) {
      var $a, $b, self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$const_name!'](name);
      if ((($a = ((($b = name['$=~'](Opal.const_get([Opal.const_get($scopes, 'Opal', true, true).$$scope], 'CONST_NAME_REGEXP', true, true))['$!']()) !== false && $b !== nil && $b != null) ? $b : name['$start_with?']("::"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "wrong constant name " + (name), name))};
      Opal.casgn(self, name, value);
      return value;
    }, TMP_Module_const_set_27.$$arity = 2);
    Opal.defn(self, '$public_constant', TMP_Module_public_constant_28 = function $$public_constant(const_name) {
      var self = this;

      return nil
    }, TMP_Module_public_constant_28.$$arity = 1);
    Opal.defn(self, '$define_method', TMP_Module_define_method_29 = function $$define_method(name, method) {
      var $a, TMP_30, self = this, $iter = TMP_Module_define_method_29.$$p, block = $iter || nil, $case = nil;

      TMP_Module_define_method_29.$$p = null;
      
      if ((($a = method === undefined && block === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to create a Proc object without a block")};
      ((($a = block) !== false && $a !== nil && $a != null) ? $a : (block = (function() {$case = method;
if (Opal.const_get($scopes, 'Proc', true, true)['$===']($case)) {return method}else if (Opal.const_get($scopes, 'Method', true, true)['$===']($case)) {return method.$to_proc().$$unbound}else if (Opal.const_get($scopes, 'UnboundMethod', true, true)['$===']($case)) {return $send(self, 'lambda', [], (TMP_30 = function($b_rest){var self = TMP_30.$$s || this, args, bound = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      
        bound = method.$bind(self);
        return $send(bound, 'call', Opal.to_a(args));}, TMP_30.$$s = self, TMP_30.$$arity = -1, TMP_30))}else {return self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "wrong argument type " + (block.$class()) + " (expected Proc/Method)")}})()));
      
      var id = '$' + name;

      block.$$jsid        = name;
      block.$$s           = null;
      block.$$def         = block;
      block.$$define_meth = true;

      Opal.defn(self, id, block);

      return name;
    ;
    }, TMP_Module_define_method_29.$$arity = -2);
    Opal.defn(self, '$remove_method', TMP_Module_remove_method_31 = function $$remove_method($a_rest) {
      var self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      
      for (var i = 0, length = names.length; i < length; i++) {
        Opal.rdef(self, "$" + names[i]);
      }
    ;
      return self;
    }, TMP_Module_remove_method_31.$$arity = -1);
    Opal.defn(self, '$singleton_class?', TMP_Module_singleton_class$q_32 = function() {
      var self = this;

      return !!self.$$is_singleton
    }, TMP_Module_singleton_class$q_32.$$arity = 0);
    Opal.defn(self, '$include', TMP_Module_include_33 = function $$include($a_rest) {
      var self = this, mods;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      mods = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        mods[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      
      for (var i = mods.length - 1; i >= 0; i--) {
        var mod = mods[i];

        if (!mod.$$is_module) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "wrong argument type " + ((mod).$class()) + " (expected Module)");
        }

        (mod).$append_features(self);
        (mod).$included(self);
      }
    ;
      return self;
    }, TMP_Module_include_33.$$arity = -1);
    Opal.defn(self, '$included_modules', TMP_Module_included_modules_34 = function $$included_modules() {
      var self = this;

      
      var results;

      var module_chain = function(klass) {
        var included = [];

        for (var i = 0; i != klass.$$inc.length; i++) {
          var mod_or_class = klass.$$inc[i];
          included.push(mod_or_class);
          included = included.concat(module_chain(mod_or_class));
        }

        return included;
      };

      results = module_chain(self);

      // need superclass's modules
      if (self.$$is_class) {
        for (var cls = self; cls; cls = cls.$$super) {
          results = results.concat(module_chain(cls));
        }
      }

      return results;
    
    }, TMP_Module_included_modules_34.$$arity = 0);
    Opal.defn(self, '$include?', TMP_Module_include$q_35 = function(mod) {
      var self = this;

      
      if (!mod.$$is_module) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "wrong argument type " + ((mod).$class()) + " (expected Module)");
      }

      var i, ii, mod2, ancestors = Opal.ancestors(self);

      for (i = 0, ii = ancestors.length; i < ii; i++) {
        mod2 = ancestors[i];
        if (mod2 === mod && mod2 !== self) {
          return true;
        }
      }

      return false;
    
    }, TMP_Module_include$q_35.$$arity = 1);
    Opal.defn(self, '$instance_method', TMP_Module_instance_method_36 = function $$instance_method(name) {
      var self = this;

      
      var meth = self.$$proto['$' + name];

      if (!meth || meth.$$stub) {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "undefined method `" + (name) + "' for class `" + (self.$name()) + "'", name));
      }

      return Opal.const_get($scopes, 'UnboundMethod', true, true).$new(self, meth.$$owner || self, meth, name);
    
    }, TMP_Module_instance_method_36.$$arity = 1);
    Opal.defn(self, '$instance_methods', TMP_Module_instance_methods_37 = function $$instance_methods(include_super) {
      var self = this;

      if (include_super == null) {
        include_super = true;
      }
      
      var value,
          methods = [],
          proto   = self.$$proto;

      for (var prop in proto) {
        if (prop.charAt(0) !== '$' || prop.charAt(1) === '$') {
          continue;
        }

        value = proto[prop];

        if (typeof(value) !== "function") {
          continue;
        }

        if (value.$$stub) {
          continue;
        }

        if (!self.$$is_module) {
          if (self !== Opal.BasicObject && value === Opal.BasicObject.$$proto[prop]) {
            continue;
          }

          if (!include_super && !proto.hasOwnProperty(prop)) {
            continue;
          }

          if (!include_super && value.$$donated) {
            continue;
          }
        }

        methods.push(prop.substr(1));
      }

      return methods;
    
    }, TMP_Module_instance_methods_37.$$arity = -1);
    Opal.defn(self, '$included', TMP_Module_included_38 = function $$included(mod) {
      var self = this;

      return nil
    }, TMP_Module_included_38.$$arity = 1);
    Opal.defn(self, '$extended', TMP_Module_extended_39 = function $$extended(mod) {
      var self = this;

      return nil
    }, TMP_Module_extended_39.$$arity = 1);
    Opal.defn(self, '$method_added', TMP_Module_method_added_40 = function $$method_added($a_rest) {
      var self = this;

      return nil
    }, TMP_Module_method_added_40.$$arity = -1);
    Opal.defn(self, '$method_removed', TMP_Module_method_removed_41 = function $$method_removed($a_rest) {
      var self = this;

      return nil
    }, TMP_Module_method_removed_41.$$arity = -1);
    Opal.defn(self, '$method_undefined', TMP_Module_method_undefined_42 = function $$method_undefined($a_rest) {
      var self = this;

      return nil
    }, TMP_Module_method_undefined_42.$$arity = -1);
    Opal.defn(self, '$module_eval', TMP_Module_module_eval_43 = function $$module_eval($a_rest) {
      var $b, $c, TMP_44, self = this, args, $iter = TMP_Module_module_eval_43.$$p, block = $iter || nil, string = nil, file = nil, _lineno = nil, default_eval_options = nil, compiling_options = nil, compiled = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Module_module_eval_43.$$p = null;
      
      if ((($b = ($c = block['$nil?'](), $c !== false && $c !== nil && $c != null ?!!Opal.compile : $c)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        
        if ((($b = $range(1, 3, false)['$cover?'](args.$size())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          } else {
          Opal.const_get($scopes, 'Kernel', true, true).$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "wrong number of arguments (0 for 1..3)")
        };
        $b = [].concat(Opal.to_a(args)), (string = ($b[0] == null ? nil : $b[0])), (file = ($b[1] == null ? nil : $b[1])), (_lineno = ($b[2] == null ? nil : $b[2])), $b;
        default_eval_options = $hash2(["file", "eval"], {"file": ((($b = file) !== false && $b !== nil && $b != null) ? $b : "(eval)"), "eval": true});
        compiling_options = Opal.hash({ arity_check: false }).$merge(default_eval_options);
        compiled = Opal.const_get($scopes, 'Opal', true, true).$compile(string, compiling_options);
        block = $send(Opal.const_get($scopes, 'Kernel', true, true), 'proc', [], (TMP_44 = function(){var self = TMP_44.$$s || this;

        
          return (function(self) {
            return eval(compiled);
          })(self)
        }, TMP_44.$$s = self, TMP_44.$$arity = 0, TMP_44));
      } else if ((($b = $rb_gt(args.$size(), 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        Opal.const_get($scopes, 'Kernel', true, true).$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (args.$size()) + " for 0)")};
      
      var old = block.$$s,
          result;

      block.$$s = null;
      result = block.apply(self, [self]);
      block.$$s = old;

      return result;
    ;
    }, TMP_Module_module_eval_43.$$arity = -1);
    Opal.alias(self, "class_eval", "module_eval");
    Opal.defn(self, '$module_exec', TMP_Module_module_exec_45 = function $$module_exec($a_rest) {
      var self = this, args, $iter = TMP_Module_module_exec_45.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Module_module_exec_45.$$p = null;
      
      if (block === nil) {
        self.$raise(Opal.const_get($scopes, 'LocalJumpError', true, true), "no block given")
      }

      var block_self = block.$$s, result;

      block.$$s = null;
      result = block.apply(self, args);
      block.$$s = block_self;

      return result;
    
    }, TMP_Module_module_exec_45.$$arity = -1);
    Opal.alias(self, "class_exec", "module_exec");
    Opal.defn(self, '$method_defined?', TMP_Module_method_defined$q_46 = function(method) {
      var self = this;

      
      var body = self.$$proto['$' + method];
      return (!!body) && !body.$$stub;
    
    }, TMP_Module_method_defined$q_46.$$arity = 1);
    Opal.defn(self, '$module_function', TMP_Module_module_function_47 = function $$module_function($a_rest) {
      var self = this, methods;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      methods = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        methods[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (methods.length === 0) {
        self.$$module_function = true;
      }
      else {
        for (var i = 0, length = methods.length; i < length; i++) {
          var meth = methods[i],
              id   = '$' + meth,
              func = self.$$proto[id];

          Opal.defs(self, id, func);
        }
      }

      return self;
    
    }, TMP_Module_module_function_47.$$arity = -1);
    Opal.defn(self, '$name', TMP_Module_name_48 = function $$name() {
      var self = this;

      
      if (self.$$full_name) {
        return self.$$full_name;
      }

      var result = [], base = self;

      while (base) {
        if (base.$$name === nil) {
          return result.length === 0 ? nil : result.join('::');
        }

        result.unshift(base.$$name);

        base = base.$$base_module;

        if (base === Opal.Object) {
          break;
        }
      }

      if (result.length === 0) {
        return nil;
      }

      return self.$$full_name = result.join('::');
    
    }, TMP_Module_name_48.$$arity = 0);
    Opal.defn(self, '$remove_const', TMP_Module_remove_const_49 = function $$remove_const(name) {
      var self = this;

      
      var old = self.$$scope[name];
      delete self.$$scope[name];
      return old;
    
    }, TMP_Module_remove_const_49.$$arity = 1);
    Opal.defn(self, '$to_s', TMP_Module_to_s_50 = function $$to_s() {
      var $a, self = this;

      return ((($a = Opal.Module.$name.call(self)) !== false && $a !== nil && $a != null) ? $a : "" + "#<" + (self.$$is_module ? 'Module' : 'Class') + ":0x" + (self.$__id__().$to_s(16)) + ">")
    }, TMP_Module_to_s_50.$$arity = 0);
    Opal.defn(self, '$undef_method', TMP_Module_undef_method_51 = function $$undef_method($a_rest) {
      var self = this, names;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      names = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        names[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      
      for (var i = 0, length = names.length; i < length; i++) {
        Opal.udef(self, "$" + names[i]);
      }
    ;
      return self;
    }, TMP_Module_undef_method_51.$$arity = -1);
    Opal.defn(self, '$instance_variables', TMP_Module_instance_variables_52 = function $$instance_variables() {
      var self = this, consts = nil;

      
      consts = self.$constants();
      
      var result = [];

      for (var name in self) {
        if (self.hasOwnProperty(name) && name.charAt(0) !== '$' && name !== 'constructor' && !consts['$include?'](name)) {
          result.push('@' + name);
        }
      }

      return result;
    ;
    }, TMP_Module_instance_variables_52.$$arity = 0);
    Opal.defn(self, '$dup', TMP_Module_dup_53 = function $$dup() {
      var self = this, $iter = TMP_Module_dup_53.$$p, $yield = $iter || nil, copy = nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Module_dup_53.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      
      copy = $send(self, Opal.find_super_dispatcher(self, 'dup', TMP_Module_dup_53, false), $zuper, $iter);
      copy.$copy_class_variables(self);
      copy.$copy_constants(self);
      return copy;
    }, TMP_Module_dup_53.$$arity = 0);
    Opal.defn(self, '$copy_class_variables', TMP_Module_copy_class_variables_54 = function $$copy_class_variables(other) {
      var self = this;

      
      for (var name in other.$$cvars) {
        self.$$cvars[name] = other.$$cvars[name];
      }
    
    }, TMP_Module_copy_class_variables_54.$$arity = 1);
    return (Opal.defn(self, '$copy_constants', TMP_Module_copy_constants_55 = function $$copy_constants(other) {
      var self = this;

      
      var other_constants = other.$$scope.constants,
          length = other_constants.length;

      for (var i = 0; i < length; i++) {
        var name = other_constants[i];
        Opal.casgn(self, name, other.$$scope[name]);
      }
    
    }, TMP_Module_copy_constants_55.$$arity = 1), nil) && 'copy_constants';
  })($scope.base, null, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/class"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send;

  Opal.add_stubs(['$require', '$allocate', '$name', '$to_s']);
  
  self.$require("corelib/module");
  return (function($base, $super, $visibility_scopes) {
    function $Class(){};
    var self = $Class = $klass($base, $super, 'Class', $Class);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Class_new_1, TMP_Class_allocate_2, TMP_Class_inherited_3, TMP_Class_new_4, TMP_Class_superclass_5, TMP_Class_to_s_6;

    
    Opal.defs(self, '$new', TMP_Class_new_1 = function(superclass) {
      var self = this, $iter = TMP_Class_new_1.$$p, block = $iter || nil;

      if (superclass == null) {
        superclass = Opal.const_get($scopes, 'Object', true, true);
      }
      TMP_Class_new_1.$$p = null;
      
      if (!superclass.$$is_class) {
        throw Opal.TypeError.$new("superclass must be a Class");
      }

      var alloc = Opal.boot_class_alloc(null, function(){}, superclass)
      var klass = Opal.setup_class_object(null, alloc, superclass.$$name, superclass.constructor);

      klass.$$super  = superclass;
      klass.$$parent = superclass;

      // inherit scope from parent
      Opal.create_scope(superclass.$$scope, klass);

      superclass.$inherited(klass);
      Opal.module_initialize(klass, block);

      return klass;
    
    }, TMP_Class_new_1.$$arity = -1);
    Opal.defn(self, '$allocate', TMP_Class_allocate_2 = function $$allocate() {
      var self = this;

      
      var obj = new self.$$alloc();
      obj.$$id = Opal.uid();
      return obj;
    
    }, TMP_Class_allocate_2.$$arity = 0);
    Opal.defn(self, '$inherited', TMP_Class_inherited_3 = function $$inherited(cls) {
      var self = this;

      return nil
    }, TMP_Class_inherited_3.$$arity = 1);
    Opal.defn(self, '$new', TMP_Class_new_4 = function($a_rest) {
      var self = this, args, $iter = TMP_Class_new_4.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Class_new_4.$$p = null;
      
      var obj = self.$allocate();

      obj.$initialize.$$p = block;
      obj.$initialize.apply(obj, args);
      return obj;
    
    }, TMP_Class_new_4.$$arity = -1);
    Opal.defn(self, '$superclass', TMP_Class_superclass_5 = function $$superclass() {
      var self = this;

      return self.$$super || nil
    }, TMP_Class_superclass_5.$$arity = 0);
    return (Opal.defn(self, '$to_s', TMP_Class_to_s_6 = function $$to_s() {
      var self = this, $iter = TMP_Class_to_s_6.$$p, $yield = $iter || nil;

      TMP_Class_to_s_6.$$p = null;
      
      var singleton_of = self.$$singleton_of;

      if (singleton_of && (singleton_of.$$is_class || singleton_of.$$is_module)) {
        return "" + "#<Class:" + ((singleton_of).$name()) + ">";
      }
      else if (singleton_of) {
        // a singleton class created from an object
        return "" + "#<Class:#<" + ((singleton_of.$$class).$name()) + ":0x" + ((Opal.id(singleton_of)).$to_s(16)) + ">>";
      }
      return $send(self, Opal.find_super_dispatcher(self, 'to_s', TMP_Class_to_s_6, false), [], null);
    
    }, TMP_Class_to_s_6.$$arity = 0), nil) && 'to_s';
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/basic_object"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $range = Opal.range, $hash2 = Opal.hash2, $send = Opal.send;

  Opal.add_stubs(['$==', '$!', '$nil?', '$cover?', '$size', '$raise', '$merge', '$compile', '$proc', '$>', '$new', '$inspect']);
  return (function($base, $super, $visibility_scopes) {
    function $BasicObject(){};
    var self = $BasicObject = $klass($base, $super, 'BasicObject', $BasicObject);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_BasicObject_initialize_1, TMP_BasicObject_$eq$eq_2, TMP_BasicObject_eql$q_3, TMP_BasicObject___id___4, TMP_BasicObject___send___5, TMP_BasicObject_$B_6, TMP_BasicObject_$B$eq_7, TMP_BasicObject_instance_eval_8, TMP_BasicObject_instance_exec_10, TMP_BasicObject_singleton_method_added_11, TMP_BasicObject_singleton_method_removed_12, TMP_BasicObject_singleton_method_undefined_13, TMP_BasicObject_method_missing_14;

    
    Opal.defn(self, '$initialize', TMP_BasicObject_initialize_1 = function $$initialize($a_rest) {
      var self = this;

      return nil
    }, TMP_BasicObject_initialize_1.$$arity = -1);
    Opal.defn(self, '$==', TMP_BasicObject_$eq$eq_2 = function(other) {
      var self = this;

      return self === other
    }, TMP_BasicObject_$eq$eq_2.$$arity = 1);
    Opal.defn(self, '$eql?', TMP_BasicObject_eql$q_3 = function(other) {
      var self = this;

      return self['$=='](other)
    }, TMP_BasicObject_eql$q_3.$$arity = 1);
    Opal.alias(self, "equal?", "==");
    Opal.defn(self, '$__id__', TMP_BasicObject___id___4 = function $$__id__() {
      var self = this;

      return self.$$id || (self.$$id = Opal.uid())
    }, TMP_BasicObject___id___4.$$arity = 0);
    Opal.defn(self, '$__send__', TMP_BasicObject___send___5 = function $$__send__(symbol, $a_rest) {
      var self = this, args, $iter = TMP_BasicObject___send___5.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_BasicObject___send___5.$$p = null;
      
      var func = self['$' + symbol]

      if (func) {
        if (block !== nil) {
          func.$$p = block;
        }

        return func.apply(self, args);
      }

      if (block !== nil) {
        self.$method_missing.$$p = block;
      }

      return self.$method_missing.apply(self, [symbol].concat(args));
    
    }, TMP_BasicObject___send___5.$$arity = -2);
    Opal.defn(self, '$!', TMP_BasicObject_$B_6 = function() {
      var self = this;

      return false
    }, TMP_BasicObject_$B_6.$$arity = 0);
    Opal.defn(self, '$!=', TMP_BasicObject_$B$eq_7 = function(other) {
      var self = this;

      return self['$=='](other)['$!']()
    }, TMP_BasicObject_$B$eq_7.$$arity = 1);
    Opal.alias(self, "equal?", "==");
    Opal.defn(self, '$instance_eval', TMP_BasicObject_instance_eval_8 = function $$instance_eval($a_rest) {
      var $b, $c, TMP_9, self = this, args, $iter = TMP_BasicObject_instance_eval_8.$$p, block = $iter || nil, string = nil, file = nil, _lineno = nil, default_eval_options = nil, compiling_options = nil, compiled = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_BasicObject_instance_eval_8.$$p = null;
      
      if ((($b = ($c = block['$nil?'](), $c !== false && $c !== nil && $c != null ?!!Opal.compile : $c)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        
        if ((($b = $range(1, 3, false)['$cover?'](args.$size())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          } else {
          Opal.const_get($scopes, 'Kernel', true, true).$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "wrong number of arguments (0 for 1..3)")
        };
        $b = [].concat(Opal.to_a(args)), (string = ($b[0] == null ? nil : $b[0])), (file = ($b[1] == null ? nil : $b[1])), (_lineno = ($b[2] == null ? nil : $b[2])), $b;
        default_eval_options = $hash2(["file", "eval"], {"file": ((($b = file) !== false && $b !== nil && $b != null) ? $b : "(eval)"), "eval": true});
        compiling_options = Opal.hash({ arity_check: false }).$merge(default_eval_options);
        compiled = Opal.const_get($scopes, 'Opal', true, true).$compile(string, compiling_options);
        block = $send(Opal.const_get($scopes, 'Kernel', true, true), 'proc', [], (TMP_9 = function(){var self = TMP_9.$$s || this;

        
          return (function(self) {
            return eval(compiled);
          })(self)
        }, TMP_9.$$s = self, TMP_9.$$arity = 0, TMP_9));
      } else if ((($b = $rb_gt(args.$size(), 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        Opal.const_get($scopes, 'Kernel', true, true).$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (args.$size()) + " for 0)")};
      
      var old = block.$$s,
          result;

      block.$$s = null;

      // Need to pass $$eval so that method definitions know if this is
      // being done on a class/module. Cannot be compiler driven since
      // send(:instance_eval) needs to work.
      if (self.$$is_class || self.$$is_module) {
        self.$$eval = true;
        try {
          result = block.call(self, self);
        }
        finally {
          self.$$eval = false;
        }
      }
      else {
        result = block.call(self, self);
      }

      block.$$s = old;

      return result;
    ;
    }, TMP_BasicObject_instance_eval_8.$$arity = -1);
    Opal.defn(self, '$instance_exec', TMP_BasicObject_instance_exec_10 = function $$instance_exec($a_rest) {
      var self = this, args, $iter = TMP_BasicObject_instance_exec_10.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_BasicObject_instance_exec_10.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        Opal.const_get($scopes, 'Kernel', true, true).$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "no block given")
      };
      
      var block_self = block.$$s,
          result;

      block.$$s = null;

      if (self.$$is_class || self.$$is_module) {
        self.$$eval = true;
        try {
          result = block.apply(self, args);
        }
        finally {
          self.$$eval = false;
        }
      }
      else {
        result = block.apply(self, args);
      }

      block.$$s = block_self;

      return result;
    ;
    }, TMP_BasicObject_instance_exec_10.$$arity = -1);
    Opal.defn(self, '$singleton_method_added', TMP_BasicObject_singleton_method_added_11 = function $$singleton_method_added($a_rest) {
      var self = this;

      return nil
    }, TMP_BasicObject_singleton_method_added_11.$$arity = -1);
    Opal.defn(self, '$singleton_method_removed', TMP_BasicObject_singleton_method_removed_12 = function $$singleton_method_removed($a_rest) {
      var self = this;

      return nil
    }, TMP_BasicObject_singleton_method_removed_12.$$arity = -1);
    Opal.defn(self, '$singleton_method_undefined', TMP_BasicObject_singleton_method_undefined_13 = function $$singleton_method_undefined($a_rest) {
      var self = this;

      return nil
    }, TMP_BasicObject_singleton_method_undefined_13.$$arity = -1);
    return (Opal.defn(self, '$method_missing', TMP_BasicObject_method_missing_14 = function $$method_missing(symbol, $a_rest) {
      var $b, self = this, args, $iter = TMP_BasicObject_method_missing_14.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_BasicObject_method_missing_14.$$p = null;
      return Opal.const_get($scopes, 'Kernel', true, true).$raise(Opal.const_get($scopes, 'NoMethodError', true, true).$new((function() {if ((($b = self.$inspect && !self.$inspect.$$stub) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return "" + "undefined method `" + (symbol) + "' for " + (self.$inspect()) + ":" + (self.$$class)
        } else {
        return "" + "undefined method `" + (symbol) + "' for " + (self.$$class)
      }; return nil; })(), symbol))
    }, TMP_BasicObject_method_missing_14.$$arity = -2), nil) && 'method_missing';
  })($scope.base, null, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/kernel"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $gvars = Opal.gvars, $send = Opal.send, $hash2 = Opal.hash2, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$new', '$inspect', '$!', '$=~', '$==', '$object_id', '$class', '$coerce_to?', '$<<', '$allocate', '$copy_instance_variables', '$copy_singleton_methods', '$initialize_clone', '$initialize_copy', '$define_method', '$singleton_class', '$to_proc', '$initialize_dup', '$for', '$>', '$size', '$pop', '$call', '$append_features', '$extended', '$length', '$respond_to?', '$[]', '$nil?', '$to_a', '$to_int', '$fetch', '$Integer', '$Float', '$to_ary', '$to_str', '$coerce_to', '$to_s', '$__id__', '$instance_variable_name!', '$coerce_to!', '$===', '$enum_for', '$result', '$print', '$format', '$puts', '$each', '$<=', '$empty?', '$exception', '$kind_of?', '$rand', '$respond_to_missing?', '$try_convert!', '$expand_path', '$join', '$start_with?', '$srand', '$new_seed', '$sym', '$arg', '$open', '$include']);
  
  (function($base, $visibility_scopes) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Kernel_method_missing_1, TMP_Kernel_$eq$_2, TMP_Kernel_$B$_3, TMP_Kernel_$eq$eq$eq_4, TMP_Kernel_$lt$eq$gt_5, TMP_Kernel_method_6, TMP_Kernel_methods_7, TMP_Kernel_Array_8, TMP_Kernel_at_exit_9, TMP_Kernel_caller_10, TMP_Kernel_class_11, TMP_Kernel_copy_instance_variables_12, TMP_Kernel_copy_singleton_methods_13, TMP_Kernel_clone_14, TMP_Kernel_initialize_clone_15, TMP_Kernel_define_singleton_method_16, TMP_Kernel_dup_17, TMP_Kernel_initialize_dup_18, TMP_Kernel_enum_for_19, TMP_Kernel_equal$q_20, TMP_Kernel_exit_21, TMP_Kernel_extend_22, TMP_Kernel_format_23, TMP_Kernel_hash_24, TMP_Kernel_initialize_copy_25, TMP_Kernel_inspect_26, TMP_Kernel_instance_of$q_27, TMP_Kernel_instance_variable_defined$q_28, TMP_Kernel_instance_variable_get_29, TMP_Kernel_instance_variable_set_30, TMP_Kernel_remove_instance_variable_31, TMP_Kernel_instance_variables_32, TMP_Kernel_Integer_33, TMP_Kernel_Float_34, TMP_Kernel_Hash_35, TMP_Kernel_is_a$q_36, TMP_Kernel_lambda_37, TMP_Kernel_load_38, TMP_Kernel_loop_39, TMP_Kernel_nil$q_41, TMP_Kernel_printf_42, TMP_Kernel_proc_43, TMP_Kernel_puts_44, TMP_Kernel_p_46, TMP_Kernel_print_47, TMP_Kernel_warn_48, TMP_Kernel_raise_49, TMP_Kernel_rand_50, TMP_Kernel_respond_to$q_51, TMP_Kernel_respond_to_missing$q_52, TMP_Kernel_require_53, TMP_Kernel_require_relative_54, TMP_Kernel_require_tree_55, TMP_Kernel_singleton_class_56, TMP_Kernel_sleep_57, TMP_Kernel_srand_58, TMP_Kernel_String_59, TMP_Kernel_tap_60, TMP_Kernel_to_proc_61, TMP_Kernel_to_s_62, TMP_Kernel_catch_63, TMP_Kernel_throw_64, TMP_Kernel_open_65;

    
    Opal.defn(self, '$method_missing', TMP_Kernel_method_missing_1 = function $$method_missing(symbol, $a_rest) {
      var self = this, args, $iter = TMP_Kernel_method_missing_1.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_Kernel_method_missing_1.$$p = null;
      return self.$raise(Opal.const_get($scopes, 'NoMethodError', true, true).$new("" + "undefined method `" + (symbol) + "' for " + (self.$inspect()), symbol, args))
    }, TMP_Kernel_method_missing_1.$$arity = -2);
    Opal.defn(self, '$=~', TMP_Kernel_$eq$_2 = function(obj) {
      var self = this;

      return false
    }, TMP_Kernel_$eq$_2.$$arity = 1);
    Opal.defn(self, '$!~', TMP_Kernel_$B$_3 = function(obj) {
      var self = this;

      return self['$=~'](obj)['$!']()
    }, TMP_Kernel_$B$_3.$$arity = 1);
    Opal.defn(self, '$===', TMP_Kernel_$eq$eq$eq_4 = function(other) {
      var $a, self = this;

      return ((($a = self.$object_id()['$=='](other.$object_id())) !== false && $a !== nil && $a != null) ? $a : self['$=='](other))
    }, TMP_Kernel_$eq$eq$eq_4.$$arity = 1);
    Opal.defn(self, '$<=>', TMP_Kernel_$lt$eq$gt_5 = function(other) {
      var self = this;

      
      // set guard for infinite recursion
      self.$$comparable = true;

      var x = self['$=='](other);

      if (x && x !== nil) {
        return 0;
      }

      return nil;
    
    }, TMP_Kernel_$lt$eq$gt_5.$$arity = 1);
    Opal.defn(self, '$method', TMP_Kernel_method_6 = function $$method(name) {
      var self = this;

      
      var meth = self['$' + name];

      if (!meth || meth.$$stub) {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "undefined method `" + (name) + "' for class `" + (self.$class()) + "'", name));
      }

      return Opal.const_get($scopes, 'Method', true, true).$new(self, meth.$$owner || self.$class(), meth, name);
    
    }, TMP_Kernel_method_6.$$arity = 1);
    Opal.defn(self, '$methods', TMP_Kernel_methods_7 = function $$methods(all) {
      var self = this;

      if (all == null) {
        all = true;
      }
      
      var methods = [];

      for (var key in self) {
        if (key[0] == "$" && typeof(self[key]) === "function") {
          if (all == false || all === nil) {
            if (!Opal.hasOwnProperty.call(self, key)) {
              continue;
            }
          }
          if (self[key].$$stub === undefined) {
            methods.push(key.substr(1));
          }
        }
      }

      return methods;
    
    }, TMP_Kernel_methods_7.$$arity = -1);
    Opal.alias(self, "public_methods", "methods");
    Opal.defn(self, '$Array', TMP_Kernel_Array_8 = function $$Array(object) {
      var self = this;

      
      var coerced;

      if (object === nil) {
        return [];
      }

      if (object.$$is_array) {
        return object;
      }

      coerced = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](object, Opal.const_get($scopes, 'Array', true, true), "to_ary");
      if (coerced !== nil) { return coerced; }

      coerced = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](object, Opal.const_get($scopes, 'Array', true, true), "to_a");
      if (coerced !== nil) { return coerced; }

      return [object];
    
    }, TMP_Kernel_Array_8.$$arity = 1);
    Opal.defn(self, '$at_exit', TMP_Kernel_at_exit_9 = function $$at_exit() {
      var $a, self = this, $iter = TMP_Kernel_at_exit_9.$$p, block = $iter || nil;
      if ($gvars.__at_exit__ == null) $gvars.__at_exit__ = nil;

      TMP_Kernel_at_exit_9.$$p = null;
      
      ((($a = $gvars.__at_exit__) !== false && $a !== nil && $a != null) ? $a : ($gvars.__at_exit__ = []));
      return $gvars.__at_exit__['$<<'](block);
    }, TMP_Kernel_at_exit_9.$$arity = 0);
    Opal.defn(self, '$caller', TMP_Kernel_caller_10 = function $$caller() {
      var self = this;

      return []
    }, TMP_Kernel_caller_10.$$arity = 0);
    Opal.defn(self, '$class', TMP_Kernel_class_11 = function() {
      var self = this;

      return self.$$class
    }, TMP_Kernel_class_11.$$arity = 0);
    Opal.defn(self, '$copy_instance_variables', TMP_Kernel_copy_instance_variables_12 = function $$copy_instance_variables(other) {
      var self = this;

      
      for (var name in other) {
        if (other.hasOwnProperty(name) && name.charAt(0) !== '$') {
          self[name] = other[name];
        }
      }
    
    }, TMP_Kernel_copy_instance_variables_12.$$arity = 1);
    Opal.defn(self, '$copy_singleton_methods', TMP_Kernel_copy_singleton_methods_13 = function $$copy_singleton_methods(other) {
      var self = this;

      
      var name;

      if (other.hasOwnProperty('$$meta')) {
        var other_singleton_class_proto = Opal.get_singleton_class(other).$$proto;
        var self_singleton_class_proto = Opal.get_singleton_class(self).$$proto;

        for (name in other_singleton_class_proto) {
          if (name.charAt(0) === '$' && other_singleton_class_proto.hasOwnProperty(name)) {
            self_singleton_class_proto[name] = other_singleton_class_proto[name];
          }
        }
      }

      for (name in other) {
        if (name.charAt(0) === '$' && name.charAt(1) !== '$' && other.hasOwnProperty(name)) {
          self[name] = other[name];
        }
      }
    
    }, TMP_Kernel_copy_singleton_methods_13.$$arity = 1);
    Opal.defn(self, '$clone', TMP_Kernel_clone_14 = function $$clone() {
      var self = this, copy = nil;

      
      copy = self.$class().$allocate();
      copy.$copy_instance_variables(self);
      copy.$copy_singleton_methods(self);
      copy.$initialize_clone(self);
      return copy;
    }, TMP_Kernel_clone_14.$$arity = 0);
    Opal.defn(self, '$initialize_clone', TMP_Kernel_initialize_clone_15 = function $$initialize_clone(other) {
      var self = this;

      return self.$initialize_copy(other)
    }, TMP_Kernel_initialize_clone_15.$$arity = 1);
    Opal.defn(self, '$define_singleton_method', TMP_Kernel_define_singleton_method_16 = function $$define_singleton_method(name, method) {
      var self = this, $iter = TMP_Kernel_define_singleton_method_16.$$p, block = $iter || nil;

      TMP_Kernel_define_singleton_method_16.$$p = null;
      return $send(self.$singleton_class(), 'define_method', [name, method], block.$to_proc())
    }, TMP_Kernel_define_singleton_method_16.$$arity = -2);
    Opal.defn(self, '$dup', TMP_Kernel_dup_17 = function $$dup() {
      var self = this, copy = nil;

      
      copy = self.$class().$allocate();
      copy.$copy_instance_variables(self);
      copy.$initialize_dup(self);
      return copy;
    }, TMP_Kernel_dup_17.$$arity = 0);
    Opal.defn(self, '$initialize_dup', TMP_Kernel_initialize_dup_18 = function $$initialize_dup(other) {
      var self = this;

      return self.$initialize_copy(other)
    }, TMP_Kernel_initialize_dup_18.$$arity = 1);
    Opal.defn(self, '$enum_for', TMP_Kernel_enum_for_19 = function $$enum_for(method, $a_rest) {
      var self = this, args, $iter = TMP_Kernel_enum_for_19.$$p, block = $iter || nil;

      if (method == null) {
        method = "each";
      }
      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_Kernel_enum_for_19.$$p = null;
      return $send(Opal.const_get($scopes, 'Enumerator', true, true), 'for', [self, method].concat(Opal.to_a(args)), block.$to_proc())
    }, TMP_Kernel_enum_for_19.$$arity = -1);
    Opal.alias(self, "to_enum", "enum_for");
    Opal.defn(self, '$equal?', TMP_Kernel_equal$q_20 = function(other) {
      var self = this;

      return self === other
    }, TMP_Kernel_equal$q_20.$$arity = 1);
    Opal.defn(self, '$exit', TMP_Kernel_exit_21 = function $$exit(status) {
      var $a, $b, self = this, block = nil;
      if ($gvars.__at_exit__ == null) $gvars.__at_exit__ = nil;

      if (status == null) {
        status = true;
      }
      
      ((($a = $gvars.__at_exit__) !== false && $a !== nil && $a != null) ? $a : ($gvars.__at_exit__ = []));
      while ((($b = $rb_gt($gvars.__at_exit__.$size(), 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      
      block = $gvars.__at_exit__.$pop();
      block.$call();};
      if ((($a = status === true) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        status = 0};
      Opal.exit(status);;
      return nil;
    }, TMP_Kernel_exit_21.$$arity = -1);
    Opal.defn(self, '$extend', TMP_Kernel_extend_22 = function $$extend($a_rest) {
      var self = this, mods;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      mods = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        mods[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      
      var singleton = self.$singleton_class();

      for (var i = mods.length - 1; i >= 0; i--) {
        var mod = mods[i];

        if (!mod.$$is_module) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "wrong argument type " + ((mod).$class()) + " (expected Module)");
        }

        (mod).$append_features(singleton);
        (mod).$extended(self);
      }
    ;
      return self;
    }, TMP_Kernel_extend_22.$$arity = -1);
    Opal.defn(self, '$format', TMP_Kernel_format_23 = function $$format(format_string, $a_rest) {
      var $b, $c, self = this, args, ary = nil;
      if ($gvars.DEBUG == null) $gvars.DEBUG = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      if ((($b = (($c = args.$length()['$=='](1)) ? args['$[]'](0)['$respond_to?']("to_ary") : args.$length()['$=='](1))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        
        ary = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](args['$[]'](0), Opal.const_get($scopes, 'Array', true, true), "to_ary");
        if ((($b = ary['$nil?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          } else {
          args = ary.$to_a()
        };};
      
      var result = '',
          //used for slicing:
          begin_slice = 0,
          end_slice,
          //used for iterating over the format string:
          i,
          len = format_string.length,
          //used for processing field values:
          arg,
          str,
          //used for processing %g and %G fields:
          exponent,
          //used for keeping track of width and precision:
          width,
          precision,
          //used for holding temporary values:
          tmp_num,
          //used for processing %{} and %<> fileds:
          hash_parameter_key,
          closing_brace_char,
          //used for processing %b, %B, %o, %x, and %X fields:
          base_number,
          base_prefix,
          base_neg_zero_regex,
          base_neg_zero_digit,
          //used for processing arguments:
          next_arg,
          seq_arg_num = 1,
          pos_arg_num = 0,
          //used for keeping track of flags:
          flags,
          FNONE  = 0,
          FSHARP = 1,
          FMINUS = 2,
          FPLUS  = 4,
          FZERO  = 8,
          FSPACE = 16,
          FWIDTH = 32,
          FPREC  = 64,
          FPREC0 = 128;

      function CHECK_FOR_FLAGS() {
        if (flags&FWIDTH) { self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "flag after width") }
        if (flags&FPREC0) { self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "flag after precision") }
      }

      function CHECK_FOR_WIDTH() {
        if (flags&FWIDTH) { self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "width given twice") }
        if (flags&FPREC0) { self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "width after precision") }
      }

      function GET_NTH_ARG(num) {
        if (num >= args.length) { self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "too few arguments") }
        return args[num];
      }

      function GET_NEXT_ARG() {
        switch (pos_arg_num) {
        case -1: self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "unnumbered(" + (seq_arg_num) + ") mixed with numbered")
        case -2: self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "unnumbered(" + (seq_arg_num) + ") mixed with named")
        }
        pos_arg_num = seq_arg_num++;
        return GET_NTH_ARG(pos_arg_num - 1);
      }

      function GET_POS_ARG(num) {
        if (pos_arg_num > 0) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "numbered(" + (num) + ") after unnumbered(" + (pos_arg_num) + ")")
        }
        if (pos_arg_num === -2) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "numbered(" + (num) + ") after named")
        }
        if (num < 1) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid index - " + (num) + "$")
        }
        pos_arg_num = -1;
        return GET_NTH_ARG(num - 1);
      }

      function GET_ARG() {
        return (next_arg === undefined ? GET_NEXT_ARG() : next_arg);
      }

      function READ_NUM(label) {
        var num, str = '';
        for (;; i++) {
          if (i === len) {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "malformed format string - %*[0-9]")
          }
          if (format_string.charCodeAt(i) < 48 || format_string.charCodeAt(i) > 57) {
            i--;
            num = parseInt(str, 10) || 0;
            if (num > 2147483647) {
              self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + (label) + " too big")
            }
            return num;
          }
          str += format_string.charAt(i);
        }
      }

      function READ_NUM_AFTER_ASTER(label) {
        var arg, num = READ_NUM(label);
        if (format_string.charAt(i + 1) === '$') {
          i++;
          arg = GET_POS_ARG(num);
        } else {
          arg = GET_NEXT_ARG();
        }
        return (arg).$to_int();
      }

      for (i = format_string.indexOf('%'); i !== -1; i = format_string.indexOf('%', i)) {
        str = undefined;

        flags = FNONE;
        width = -1;
        precision = -1;
        next_arg = undefined;

        end_slice = i;

        i++;

        switch (format_string.charAt(i)) {
        case '%':
          begin_slice = i;
        case '':
        case '\n':
        case '\0':
          i++;
          continue;
        }

        format_sequence: for (; i < len; i++) {
          switch (format_string.charAt(i)) {

          case ' ':
            CHECK_FOR_FLAGS();
            flags |= FSPACE;
            continue format_sequence;

          case '#':
            CHECK_FOR_FLAGS();
            flags |= FSHARP;
            continue format_sequence;

          case '+':
            CHECK_FOR_FLAGS();
            flags |= FPLUS;
            continue format_sequence;

          case '-':
            CHECK_FOR_FLAGS();
            flags |= FMINUS;
            continue format_sequence;

          case '0':
            CHECK_FOR_FLAGS();
            flags |= FZERO;
            continue format_sequence;

          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9':
            tmp_num = READ_NUM('width');
            if (format_string.charAt(i + 1) === '$') {
              if (i + 2 === len) {
                str = '%';
                i++;
                break format_sequence;
              }
              if (next_arg !== undefined) {
                self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "value given twice - %" + (tmp_num) + "$")
              }
              next_arg = GET_POS_ARG(tmp_num);
              i++;
            } else {
              CHECK_FOR_WIDTH();
              flags |= FWIDTH;
              width = tmp_num;
            }
            continue format_sequence;

          case '<':
          case '\{':
            closing_brace_char = (format_string.charAt(i) === '<' ? '>' : '\}');
            hash_parameter_key = '';

            i++;

            for (;; i++) {
              if (i === len) {
                self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "malformed name - unmatched parenthesis")
              }
              if (format_string.charAt(i) === closing_brace_char) {

                if (pos_arg_num > 0) {
                  self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "named " + (hash_parameter_key) + " after unnumbered(" + (pos_arg_num) + ")")
                }
                if (pos_arg_num === -1) {
                  self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "named " + (hash_parameter_key) + " after numbered")
                }
                pos_arg_num = -2;

                if (args[0] === undefined || !args[0].$$is_hash) {
                  self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "one hash required")
                }

                next_arg = (args[0]).$fetch(hash_parameter_key);

                if (closing_brace_char === '>') {
                  continue format_sequence;
                } else {
                  str = next_arg.toString();
                  if (precision !== -1) { str = str.slice(0, precision); }
                  if (flags&FMINUS) {
                    while (str.length < width) { str = str + ' '; }
                  } else {
                    while (str.length < width) { str = ' ' + str; }
                  }
                  break format_sequence;
                }
              }
              hash_parameter_key += format_string.charAt(i);
            }

          case '*':
            i++;
            CHECK_FOR_WIDTH();
            flags |= FWIDTH;
            width = READ_NUM_AFTER_ASTER('width');
            if (width < 0) {
              flags |= FMINUS;
              width = -width;
            }
            continue format_sequence;

          case '.':
            if (flags&FPREC0) {
              self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "precision given twice")
            }
            flags |= FPREC|FPREC0;
            precision = 0;
            i++;
            if (format_string.charAt(i) === '*') {
              i++;
              precision = READ_NUM_AFTER_ASTER('precision');
              if (precision < 0) {
                flags &= ~FPREC;
              }
              continue format_sequence;
            }
            precision = READ_NUM('precision');
            continue format_sequence;

          case 'd':
          case 'i':
          case 'u':
            arg = self.$Integer(GET_ARG());
            if (arg >= 0) {
              str = arg.toString();
              while (str.length < precision) { str = '0' + str; }
              if (flags&FMINUS) {
                if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && precision === -1) {
                  while (str.length < width - ((flags&FPLUS || flags&FSPACE) ? 1 : 0)) { str = '0' + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                } else {
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            } else {
              str = (-arg).toString();
              while (str.length < precision) { str = '0' + str; }
              if (flags&FMINUS) {
                str = '-' + str;
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && precision === -1) {
                  while (str.length < width - 1) { str = '0' + str; }
                  str = '-' + str;
                } else {
                  str = '-' + str;
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            }
            break format_sequence;

          case 'b':
          case 'B':
          case 'o':
          case 'x':
          case 'X':
            switch (format_string.charAt(i)) {
            case 'b':
            case 'B':
              base_number = 2;
              base_prefix = '0b';
              base_neg_zero_regex = /^1+/;
              base_neg_zero_digit = '1';
              break;
            case 'o':
              base_number = 8;
              base_prefix = '0';
              base_neg_zero_regex = /^3?7+/;
              base_neg_zero_digit = '7';
              break;
            case 'x':
            case 'X':
              base_number = 16;
              base_prefix = '0x';
              base_neg_zero_regex = /^f+/;
              base_neg_zero_digit = 'f';
              break;
            }
            arg = self.$Integer(GET_ARG());
            if (arg >= 0) {
              str = arg.toString(base_number);
              while (str.length < precision) { str = '0' + str; }
              if (flags&FMINUS) {
                if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                if (flags&FSHARP && arg !== 0) { str = base_prefix + str; }
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && precision === -1) {
                  while (str.length < width - ((flags&FPLUS || flags&FSPACE) ? 1 : 0) - ((flags&FSHARP && arg !== 0) ? base_prefix.length : 0)) { str = '0' + str; }
                  if (flags&FSHARP && arg !== 0) { str = base_prefix + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                } else {
                  if (flags&FSHARP && arg !== 0) { str = base_prefix + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            } else {
              if (flags&FPLUS || flags&FSPACE) {
                str = (-arg).toString(base_number);
                while (str.length < precision) { str = '0' + str; }
                if (flags&FMINUS) {
                  if (flags&FSHARP) { str = base_prefix + str; }
                  str = '-' + str;
                  while (str.length < width) { str = str + ' '; }
                } else {
                  if (flags&FZERO && precision === -1) {
                    while (str.length < width - 1 - (flags&FSHARP ? 2 : 0)) { str = '0' + str; }
                    if (flags&FSHARP) { str = base_prefix + str; }
                    str = '-' + str;
                  } else {
                    if (flags&FSHARP) { str = base_prefix + str; }
                    str = '-' + str;
                    while (str.length < width) { str = ' ' + str; }
                  }
                }
              } else {
                str = (arg >>> 0).toString(base_number).replace(base_neg_zero_regex, base_neg_zero_digit);
                while (str.length < precision - 2) { str = base_neg_zero_digit + str; }
                if (flags&FMINUS) {
                  str = '..' + str;
                  if (flags&FSHARP) { str = base_prefix + str; }
                  while (str.length < width) { str = str + ' '; }
                } else {
                  if (flags&FZERO && precision === -1) {
                    while (str.length < width - 2 - (flags&FSHARP ? base_prefix.length : 0)) { str = base_neg_zero_digit + str; }
                    str = '..' + str;
                    if (flags&FSHARP) { str = base_prefix + str; }
                  } else {
                    str = '..' + str;
                    if (flags&FSHARP) { str = base_prefix + str; }
                    while (str.length < width) { str = ' ' + str; }
                  }
                }
              }
            }
            if (format_string.charAt(i) === format_string.charAt(i).toUpperCase()) {
              str = str.toUpperCase();
            }
            break format_sequence;

          case 'f':
          case 'e':
          case 'E':
          case 'g':
          case 'G':
            arg = self.$Float(GET_ARG());
            if (arg >= 0 || isNaN(arg)) {
              if (arg === Infinity) {
                str = 'Inf';
              } else {
                switch (format_string.charAt(i)) {
                case 'f':
                  str = arg.toFixed(precision === -1 ? 6 : precision);
                  break;
                case 'e':
                case 'E':
                  str = arg.toExponential(precision === -1 ? 6 : precision);
                  break;
                case 'g':
                case 'G':
                  str = arg.toExponential();
                  exponent = parseInt(str.split('e')[1], 10);
                  if (!(exponent < -4 || exponent >= (precision === -1 ? 6 : precision))) {
                    str = arg.toPrecision(precision === -1 ? (flags&FSHARP ? 6 : undefined) : precision);
                  }
                  break;
                }
              }
              if (flags&FMINUS) {
                if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && arg !== Infinity && !isNaN(arg)) {
                  while (str.length < width - ((flags&FPLUS || flags&FSPACE) ? 1 : 0)) { str = '0' + str; }
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                } else {
                  if (flags&FPLUS || flags&FSPACE) { str = (flags&FPLUS ? '+' : ' ') + str; }
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            } else {
              if (arg === -Infinity) {
                str = 'Inf';
              } else {
                switch (format_string.charAt(i)) {
                case 'f':
                  str = (-arg).toFixed(precision === -1 ? 6 : precision);
                  break;
                case 'e':
                case 'E':
                  str = (-arg).toExponential(precision === -1 ? 6 : precision);
                  break;
                case 'g':
                case 'G':
                  str = (-arg).toExponential();
                  exponent = parseInt(str.split('e')[1], 10);
                  if (!(exponent < -4 || exponent >= (precision === -1 ? 6 : precision))) {
                    str = (-arg).toPrecision(precision === -1 ? (flags&FSHARP ? 6 : undefined) : precision);
                  }
                  break;
                }
              }
              if (flags&FMINUS) {
                str = '-' + str;
                while (str.length < width) { str = str + ' '; }
              } else {
                if (flags&FZERO && arg !== -Infinity) {
                  while (str.length < width - 1) { str = '0' + str; }
                  str = '-' + str;
                } else {
                  str = '-' + str;
                  while (str.length < width) { str = ' ' + str; }
                }
              }
            }
            if (format_string.charAt(i) === format_string.charAt(i).toUpperCase() && arg !== Infinity && arg !== -Infinity && !isNaN(arg)) {
              str = str.toUpperCase();
            }
            str = str.replace(/([eE][-+]?)([0-9])$/, '$10$2');
            break format_sequence;

          case 'a':
          case 'A':
            // Not implemented because there are no specs for this field type.
            self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), "`A` and `a` format field types are not implemented in Opal yet")

          case 'c':
            arg = GET_ARG();
            if ((arg)['$respond_to?']("to_ary")) { arg = (arg).$to_ary()[0]; }
            if ((arg)['$respond_to?']("to_str")) {
              str = (arg).$to_str();
            } else {
              str = String.fromCharCode(Opal.const_get($scopes, 'Opal', true, true).$coerce_to(arg, Opal.const_get($scopes, 'Integer', true, true), "to_int"));
            }
            if (str.length !== 1) {
              self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "%c requires a character")
            }
            if (flags&FMINUS) {
              while (str.length < width) { str = str + ' '; }
            } else {
              while (str.length < width) { str = ' ' + str; }
            }
            break format_sequence;

          case 'p':
            str = (GET_ARG()).$inspect();
            if (precision !== -1) { str = str.slice(0, precision); }
            if (flags&FMINUS) {
              while (str.length < width) { str = str + ' '; }
            } else {
              while (str.length < width) { str = ' ' + str; }
            }
            break format_sequence;

          case 's':
            str = (GET_ARG()).$to_s();
            if (precision !== -1) { str = str.slice(0, precision); }
            if (flags&FMINUS) {
              while (str.length < width) { str = str + ' '; }
            } else {
              while (str.length < width) { str = ' ' + str; }
            }
            break format_sequence;

          default:
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "malformed format string - %" + (format_string.charAt(i)))
          }
        }

        if (str === undefined) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "malformed format string - %")
        }

        result += format_string.slice(begin_slice, end_slice) + str;
        begin_slice = i + 1;
      }

      if ($gvars.DEBUG && pos_arg_num >= 0 && seq_arg_num < args.length) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "too many arguments for format string")
      }

      return result + format_string.slice(begin_slice);
    ;
    }, TMP_Kernel_format_23.$$arity = -2);
    Opal.defn(self, '$hash', TMP_Kernel_hash_24 = function $$hash() {
      var self = this;

      return self.$__id__()
    }, TMP_Kernel_hash_24.$$arity = 0);
    Opal.defn(self, '$initialize_copy', TMP_Kernel_initialize_copy_25 = function $$initialize_copy(other) {
      var self = this;

      return nil
    }, TMP_Kernel_initialize_copy_25.$$arity = 1);
    Opal.defn(self, '$inspect', TMP_Kernel_inspect_26 = function $$inspect() {
      var self = this;

      return self.$to_s()
    }, TMP_Kernel_inspect_26.$$arity = 0);
    Opal.defn(self, '$instance_of?', TMP_Kernel_instance_of$q_27 = function(klass) {
      var self = this;

      
      if (!klass.$$is_class && !klass.$$is_module) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "class or module required");
      }

      return self.$$class === klass;
    
    }, TMP_Kernel_instance_of$q_27.$$arity = 1);
    Opal.defn(self, '$instance_variable_defined?', TMP_Kernel_instance_variable_defined$q_28 = function(name) {
      var self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$instance_variable_name!'](name);
      return Opal.hasOwnProperty.call(self, name.substr(1));
    }, TMP_Kernel_instance_variable_defined$q_28.$$arity = 1);
    Opal.defn(self, '$instance_variable_get', TMP_Kernel_instance_variable_get_29 = function $$instance_variable_get(name) {
      var self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$instance_variable_name!'](name);
      
      var ivar = self[Opal.ivar(name.substr(1))];

      return ivar == null ? nil : ivar;
    ;
    }, TMP_Kernel_instance_variable_get_29.$$arity = 1);
    Opal.defn(self, '$instance_variable_set', TMP_Kernel_instance_variable_set_30 = function $$instance_variable_set(name, value) {
      var self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$instance_variable_name!'](name);
      return self[Opal.ivar(name.substr(1))] = value;
    }, TMP_Kernel_instance_variable_set_30.$$arity = 2);
    Opal.defn(self, '$remove_instance_variable', TMP_Kernel_remove_instance_variable_31 = function $$remove_instance_variable(name) {
      var self = this;

      
      name = Opal.const_get($scopes, 'Opal', true, true)['$instance_variable_name!'](name);
      
      var key = Opal.ivar(name.substr(1)),
          val;
      if (self.hasOwnProperty(key)) {
        val = self[key];
        delete self[key];
        return val;
      }
    ;
      return self.$raise(Opal.const_get($scopes, 'NameError', true, true), "" + "instance variable " + (name) + " not defined");
    }, TMP_Kernel_remove_instance_variable_31.$$arity = 1);
    Opal.defn(self, '$instance_variables', TMP_Kernel_instance_variables_32 = function $$instance_variables() {
      var self = this;

      
      var result = [], ivar;

      for (var name in self) {
        if (self.hasOwnProperty(name) && name.charAt(0) !== '$') {
          if (name.substr(-1) === '$') {
            ivar = name.slice(0, name.length - 1);
          } else {
            ivar = name;
          }
          result.push('@' + ivar);
        }
      }

      return result;
    
    }, TMP_Kernel_instance_variables_32.$$arity = 0);
    Opal.defn(self, '$Integer', TMP_Kernel_Integer_33 = function $$Integer(value, base) {
      var self = this;

      
      var i, str, base_digits;

      if (!value.$$is_string) {
        if (base !== undefined) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "base specified for non string value")
        }
        if (value === nil) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "can't convert nil into Integer")
        }
        if (value.$$is_number) {
          if (value === Infinity || value === -Infinity || isNaN(value)) {
            self.$raise(Opal.const_get($scopes, 'FloatDomainError', true, true), value)
          }
          return Math.floor(value);
        }
        if (value['$respond_to?']("to_int")) {
          i = value.$to_int();
          if (i !== nil) {
            return i;
          }
        }
        return Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](value, Opal.const_get($scopes, 'Integer', true, true), "to_i");
      }

      if (value === "0") {
        return 0;
      }

      if (base === undefined) {
        base = 0;
      } else {
        base = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(base, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if (base === 1 || base < 0 || base > 36) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid radix " + (base))
        }
      }

      str = value.toLowerCase();

      str = str.replace(/(\d)_(?=\d)/g, '$1');

      str = str.replace(/^(\s*[+-]?)(0[bodx]?)/, function (_, head, flag) {
        switch (flag) {
        case '0b':
          if (base === 0 || base === 2) {
            base = 2;
            return head;
          }
        case '0':
        case '0o':
          if (base === 0 || base === 8) {
            base = 8;
            return head;
          }
        case '0d':
          if (base === 0 || base === 10) {
            base = 10;
            return head;
          }
        case '0x':
          if (base === 0 || base === 16) {
            base = 16;
            return head;
          }
        }
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid value for Integer(): \"" + (value) + "\"")
      });

      base = (base === 0 ? 10 : base);

      base_digits = '0-' + (base <= 10 ? base - 1 : '9a-' + String.fromCharCode(97 + (base - 11)));

      if (!(new RegExp('^\\s*[+-]?[' + base_digits + ']+\\s*$')).test(str)) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid value for Integer(): \"" + (value) + "\"")
      }

      i = parseInt(str, base);

      if (isNaN(i)) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid value for Integer(): \"" + (value) + "\"")
      }

      return i;
    
    }, TMP_Kernel_Integer_33.$$arity = -2);
    Opal.defn(self, '$Float', TMP_Kernel_Float_34 = function $$Float(value) {
      var self = this;

      
      var str;

      if (value === nil) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "can't convert nil into Float")
      }

      if (value.$$is_string) {
        str = value.toString();

        str = str.replace(/(\d)_(?=\d)/g, '$1');

        //Special case for hex strings only:
        if (/^\s*[-+]?0[xX][0-9a-fA-F]+\s*$/.test(str)) {
          return self.$Integer(str);
        }

        if (!/^\s*[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?\s*$/.test(str)) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid value for Float(): \"" + (value) + "\"")
        }

        return parseFloat(str);
      }

      return Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](value, Opal.const_get($scopes, 'Float', true, true), "to_f");
    
    }, TMP_Kernel_Float_34.$$arity = 1);
    Opal.defn(self, '$Hash', TMP_Kernel_Hash_35 = function $$Hash(arg) {
      var $a, $b, self = this;

      
      if ((($a = ((($b = arg['$nil?']()) !== false && $b !== nil && $b != null) ? $b : arg['$==']([]))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $hash2([], {})};
      if ((($a = Opal.const_get($scopes, 'Hash', true, true)['$==='](arg)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return arg};
      return Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](arg, Opal.const_get($scopes, 'Hash', true, true), "to_hash");
    }, TMP_Kernel_Hash_35.$$arity = 1);
    Opal.defn(self, '$is_a?', TMP_Kernel_is_a$q_36 = function(klass) {
      var self = this;

      
      if (!klass.$$is_class && !klass.$$is_module) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "class or module required");
      }

      return Opal.is_a(self, klass);
    
    }, TMP_Kernel_is_a$q_36.$$arity = 1);
    Opal.alias(self, "kind_of?", "is_a?");
    Opal.defn(self, '$lambda', TMP_Kernel_lambda_37 = function $$lambda() {
      var self = this, $iter = TMP_Kernel_lambda_37.$$p, block = $iter || nil;

      TMP_Kernel_lambda_37.$$p = null;
      
      block.$$is_lambda = true;
      return block;
    }, TMP_Kernel_lambda_37.$$arity = 0);
    Opal.defn(self, '$load', TMP_Kernel_load_38 = function $$load(file) {
      var self = this;

      
      file = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](file, Opal.const_get($scopes, 'String', true, true), "to_str");
      return Opal.load(file);
    }, TMP_Kernel_load_38.$$arity = 1);
    Opal.defn(self, '$loop', TMP_Kernel_loop_39 = function $$loop() {
      var TMP_40, $a, $b, self = this, $iter = TMP_Kernel_loop_39.$$p, $yield = $iter || nil, e = nil;

      TMP_Kernel_loop_39.$$p = null;
      
      if (($yield !== nil)) {
        } else {
        return $send(self, 'enum_for', ["loop"], (TMP_40 = function(){var self = TMP_40.$$s || this;

        return Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'INFINITY', true, true)}, TMP_40.$$s = self, TMP_40.$$arity = 0, TMP_40))
      };
      while ((($b = true) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      
      try {
        Opal.yieldX($yield, [])
      } catch ($err) {
        if (Opal.rescue($err, [Opal.const_get($scopes, 'StopIteration', true, true)])) {e = $err;
          try {
            return e.$result()
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };};
      return self;
    }, TMP_Kernel_loop_39.$$arity = 0);
    Opal.defn(self, '$nil?', TMP_Kernel_nil$q_41 = function() {
      var self = this;

      return false
    }, TMP_Kernel_nil$q_41.$$arity = 0);
    Opal.alias(self, "object_id", "__id__");
    Opal.defn(self, '$printf', TMP_Kernel_printf_42 = function $$printf($a_rest) {
      var $b, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if ((($b = $rb_gt(args.$length(), 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.$print($send(self, 'format', Opal.to_a(args)))};
      return nil;
    }, TMP_Kernel_printf_42.$$arity = -1);
    Opal.defn(self, '$proc', TMP_Kernel_proc_43 = function $$proc() {
      var self = this, $iter = TMP_Kernel_proc_43.$$p, block = $iter || nil;

      TMP_Kernel_proc_43.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to create Proc object without a block")
      };
      block.$$is_lambda = false;
      return block;
    }, TMP_Kernel_proc_43.$$arity = 0);
    Opal.defn(self, '$puts', TMP_Kernel_puts_44 = function $$puts($a_rest) {
      var self = this, strs;
      if ($gvars.stdout == null) $gvars.stdout = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      strs = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        strs[$arg_idx - 0] = arguments[$arg_idx];
      }
      return $send($gvars.stdout, 'puts', Opal.to_a(strs))
    }, TMP_Kernel_puts_44.$$arity = -1);
    Opal.defn(self, '$p', TMP_Kernel_p_46 = function $$p($a_rest) {
      var TMP_45, $b, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      $send(args, 'each', [], (TMP_45 = function(obj){var self = TMP_45.$$s || this;
        if ($gvars.stdout == null) $gvars.stdout = nil;
if (obj == null) obj = nil;
      return $gvars.stdout.$puts(obj.$inspect())}, TMP_45.$$s = self, TMP_45.$$arity = 1, TMP_45));
      if ((($b = $rb_le(args.$length(), 1)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return args['$[]'](0)
        } else {
        return args
      };
    }, TMP_Kernel_p_46.$$arity = -1);
    Opal.defn(self, '$print', TMP_Kernel_print_47 = function $$print($a_rest) {
      var self = this, strs;
      if ($gvars.stdout == null) $gvars.stdout = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      strs = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        strs[$arg_idx - 0] = arguments[$arg_idx];
      }
      return $send($gvars.stdout, 'print', Opal.to_a(strs))
    }, TMP_Kernel_print_47.$$arity = -1);
    Opal.defn(self, '$warn', TMP_Kernel_warn_48 = function $$warn($a_rest) {
      var $b, $c, self = this, strs;
      if ($gvars.VERBOSE == null) $gvars.VERBOSE = nil;
      if ($gvars.stderr == null) $gvars.stderr = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      strs = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        strs[$arg_idx - 0] = arguments[$arg_idx];
      }
      if ((($b = ((($c = $gvars.VERBOSE['$nil?']()) !== false && $c !== nil && $c != null) ? $c : strs['$empty?']())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return nil
        } else {
        return $send($gvars.stderr, 'puts', Opal.to_a(strs))
      }
    }, TMP_Kernel_warn_48.$$arity = -1);
    Opal.defn(self, '$raise', TMP_Kernel_raise_49 = function $$raise(exception, string, _backtrace) {
      var self = this;
      if ($gvars["!"] == null) $gvars["!"] = nil;

      if (string == null) {
        string = nil;
      }
      if (_backtrace == null) {
        _backtrace = nil;
      }
      
      if (exception == null && $gvars["!"] !== nil) {
        throw $gvars["!"];
      }
      if (exception == null) {
        exception = Opal.const_get($scopes, 'RuntimeError', true, true).$new();
      }
      else if (exception.$$is_string) {
        exception = Opal.const_get($scopes, 'RuntimeError', true, true).$new(exception);
      }
      // using respond_to? and not an undefined check to avoid method_missing matching as true
      else if (exception.$$is_class && exception['$respond_to?']("exception")) {
        exception = exception.$exception(string);
      }
      else if (exception['$kind_of?'](Opal.const_get($scopes, 'Exception', true, true))) {
        // exception is fine
      }
      else {
        exception = Opal.const_get($scopes, 'TypeError', true, true).$new("exception class/object expected");
      }

      if ($gvars["!"] !== nil) {
        Opal.exceptions.push($gvars["!"]);
      }

      $gvars["!"] = exception;

      throw exception;
    
    }, TMP_Kernel_raise_49.$$arity = -1);
    Opal.alias(self, "fail", "raise");
    Opal.defn(self, '$rand', TMP_Kernel_rand_50 = function $$rand(max) {
      var self = this;

      
      
      if (max === undefined) {
        return Opal.const_get([Opal.const_get($scopes, 'Random', true, true).$$scope], 'DEFAULT', true, true).$rand();
      }

      if (max.$$is_number) {
        if (max < 0) {
          max = Math.abs(max);
        }

        if (max % 1 !== 0) {
          max = max.$to_i();
        }

        if (max === 0) {
          max = undefined;
        }
      }
    ;
      return Opal.const_get([Opal.const_get($scopes, 'Random', true, true).$$scope], 'DEFAULT', true, true).$rand(max);
    }, TMP_Kernel_rand_50.$$arity = -1);
    Opal.defn(self, '$respond_to?', TMP_Kernel_respond_to$q_51 = function(name, include_all) {
      var $a, self = this;

      if (include_all == null) {
        include_all = false;
      }
      
      if ((($a = self['$respond_to_missing?'](name, include_all)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      
      var body = self['$' + name];

      if (typeof(body) === "function" && !body.$$stub) {
        return true;
      }
    ;
      return false;
    }, TMP_Kernel_respond_to$q_51.$$arity = -2);
    Opal.defn(self, '$respond_to_missing?', TMP_Kernel_respond_to_missing$q_52 = function(method_name, include_all) {
      var self = this;

      if (include_all == null) {
        include_all = false;
      }
      return false
    }, TMP_Kernel_respond_to_missing$q_52.$$arity = -2);
    Opal.defn(self, '$require', TMP_Kernel_require_53 = function $$require(file) {
      var self = this;

      
      file = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](file, Opal.const_get($scopes, 'String', true, true), "to_str");
      return Opal.require(file);
    }, TMP_Kernel_require_53.$$arity = 1);
    Opal.defn(self, '$require_relative', TMP_Kernel_require_relative_54 = function $$require_relative(file) {
      var self = this;

      
      Opal.const_get($scopes, 'Opal', true, true)['$try_convert!'](file, Opal.const_get($scopes, 'String', true, true), "to_str");
      file = Opal.const_get($scopes, 'File', true, true).$expand_path(Opal.const_get($scopes, 'File', true, true).$join(Opal.current_file, "..", file));
      return Opal.require(file);
    }, TMP_Kernel_require_relative_54.$$arity = 1);
    Opal.defn(self, '$require_tree', TMP_Kernel_require_tree_55 = function $$require_tree(path) {
      var self = this;

      
      path = Opal.const_get($scopes, 'File', true, true).$expand_path(path);
      if (path['$=='](".")) {
        path = ""};
      
      for (var name in Opal.modules) {
        if ((name)['$start_with?'](path)) {
          Opal.require(name);
        }
      }
    ;
      return nil;
    }, TMP_Kernel_require_tree_55.$$arity = 1);
    Opal.alias(self, "send", "__send__");
    Opal.alias(self, "public_send", "__send__");
    Opal.defn(self, '$singleton_class', TMP_Kernel_singleton_class_56 = function $$singleton_class() {
      var self = this;

      return Opal.get_singleton_class(self)
    }, TMP_Kernel_singleton_class_56.$$arity = 0);
    Opal.defn(self, '$sleep', TMP_Kernel_sleep_57 = function $$sleep(seconds) {
      var self = this;

      if (seconds == null) {
        seconds = nil;
      }
      
      if (seconds === nil) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "can't convert NilClass into time interval")
      }
      if (!seconds.$$is_number) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't convert " + (seconds.$class()) + " into time interval")
      }
      if (seconds < 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "time interval must be positive")
      }
      var t = new Date();
      while (new Date() - t <= seconds * 1000);
      return seconds;
    
    }, TMP_Kernel_sleep_57.$$arity = -1);
    Opal.alias(self, "sprintf", "format");
    Opal.defn(self, '$srand', TMP_Kernel_srand_58 = function $$srand(seed) {
      var self = this;

      if (seed == null) {
        seed = Opal.const_get($scopes, 'Random', true, true).$new_seed();
      }
      return Opal.const_get($scopes, 'Random', true, true).$srand(seed)
    }, TMP_Kernel_srand_58.$$arity = -1);
    Opal.defn(self, '$String', TMP_Kernel_String_59 = function $$String(str) {
      var $a, self = this;

      return ((($a = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](str, Opal.const_get($scopes, 'String', true, true), "to_str")) !== false && $a !== nil && $a != null) ? $a : Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](str, Opal.const_get($scopes, 'String', true, true), "to_s"))
    }, TMP_Kernel_String_59.$$arity = 1);
    Opal.defn(self, '$tap', TMP_Kernel_tap_60 = function $$tap() {
      var self = this, $iter = TMP_Kernel_tap_60.$$p, block = $iter || nil;

      TMP_Kernel_tap_60.$$p = null;
      
      Opal.yield1(block, self);
      return self;
    }, TMP_Kernel_tap_60.$$arity = 0);
    Opal.defn(self, '$to_proc', TMP_Kernel_to_proc_61 = function $$to_proc() {
      var self = this;

      return self
    }, TMP_Kernel_to_proc_61.$$arity = 0);
    Opal.defn(self, '$to_s', TMP_Kernel_to_s_62 = function $$to_s() {
      var self = this;

      return "" + "#<" + (self.$class()) + ":0x" + (self.$__id__().$to_s(16)) + ">"
    }, TMP_Kernel_to_s_62.$$arity = 0);
    Opal.defn(self, '$catch', TMP_Kernel_catch_63 = function(sym) {
      var self = this, $iter = TMP_Kernel_catch_63.$$p, $yield = $iter || nil, e = nil;

      TMP_Kernel_catch_63.$$p = null;
      try {
        return Opal.yieldX($yield, []);
      } catch ($err) {
        if (Opal.rescue($err, [Opal.const_get($scopes, 'UncaughtThrowError', true, true)])) {e = $err;
          try {
            
            if (e.$sym()['$=='](sym)) {
              return e.$arg()};
            return self.$raise();
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      }
    }, TMP_Kernel_catch_63.$$arity = 1);
    Opal.defn(self, '$throw', TMP_Kernel_throw_64 = function($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return self.$raise(Opal.const_get($scopes, 'UncaughtThrowError', true, true).$new(args))
    }, TMP_Kernel_throw_64.$$arity = -1);
    Opal.defn(self, '$open', TMP_Kernel_open_65 = function $$open($a_rest) {
      var self = this, args, $iter = TMP_Kernel_open_65.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Kernel_open_65.$$p = null;
      return $send(Opal.const_get($scopes, 'File', true, true), 'open', Opal.to_a(args), block.$to_proc())
    }, TMP_Kernel_open_65.$$arity = -1);
  })($scope.base, $scopes);
  return (function($base, $super, $visibility_scopes) {
    function $Object(){};
    var self = $Object = $klass($base, $super, 'Object', $Object);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return self.$include(Opal.const_get($scopes, 'Kernel', true, true))
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/error"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send, $module = Opal.module;

  Opal.add_stubs(['$new', '$clone', '$to_s', '$empty?', '$class', '$attr_reader', '$[]', '$>', '$length', '$inspect']);
  
  (function($base, $super, $visibility_scopes) {
    function $Exception(){};
    var self = $Exception = $klass($base, $super, 'Exception', $Exception);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Exception_new_1, TMP_Exception_exception_2, TMP_Exception_initialize_3, TMP_Exception_backtrace_4, TMP_Exception_exception_5, TMP_Exception_message_6, TMP_Exception_inspect_7, TMP_Exception_to_s_8;

    def.message = nil;
    
    Opal.defs(self, '$new', TMP_Exception_new_1 = function($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var message = (args.length > 0) ? args[0] : nil;
      var err = new self.$$alloc(message);

      if (Error.captureStackTrace) {
        Error.captureStackTrace(err);
      }

      err.name = self.$$name;
      err.$initialize.apply(err, args);
      return err;
    
    }, TMP_Exception_new_1.$$arity = -1);
    Opal.defs(self, '$exception', TMP_Exception_exception_2 = function $$exception($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return $send(self, 'new', Opal.to_a(args))
    }, TMP_Exception_exception_2.$$arity = -1);
    Opal.defn(self, '$initialize', TMP_Exception_initialize_3 = function $$initialize($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return self.message = (args.length > 0) ? args[0] : nil
    }, TMP_Exception_initialize_3.$$arity = -1);
    Opal.defn(self, '$backtrace', TMP_Exception_backtrace_4 = function $$backtrace() {
      var self = this;

      
      var backtrace = self.stack;

      if (typeof(backtrace) === 'string') {
        return backtrace.split("\n").slice(0, 15);
      }
      else if (backtrace) {
        return backtrace.slice(0, 15);
      }

      return [];
    
    }, TMP_Exception_backtrace_4.$$arity = 0);
    Opal.defn(self, '$exception', TMP_Exception_exception_5 = function $$exception(str) {
      var self = this;

      if (str == null) {
        str = nil;
      }
      
      if (str === nil || self === str) {
        return self;
      }

      var cloned = self.$clone();
      cloned.message = str;
      return cloned;
    
    }, TMP_Exception_exception_5.$$arity = -1);
    Opal.defn(self, '$message', TMP_Exception_message_6 = function $$message() {
      var self = this;

      return self.$to_s()
    }, TMP_Exception_message_6.$$arity = 0);
    Opal.defn(self, '$inspect', TMP_Exception_inspect_7 = function $$inspect() {
      var $a, self = this, as_str = nil;

      
      as_str = self.$to_s();
      if ((($a = as_str['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$class().$to_s()
        } else {
        return "" + "#<" + (self.$class().$to_s()) + ": " + (self.$to_s()) + ">"
      };
    }, TMP_Exception_inspect_7.$$arity = 0);
    return (Opal.defn(self, '$to_s', TMP_Exception_to_s_8 = function $$to_s() {
      var $a, $b, self = this;

      return ((($a = ($b = self.message, $b !== false && $b !== nil && $b != null ?self.message.$to_s() : $b)) !== false && $a !== nil && $a != null) ? $a : self.$class().$to_s())
    }, TMP_Exception_to_s_8.$$arity = 0), nil) && 'to_s';
  })($scope.base, Error, $scopes);
  (function($base, $super, $visibility_scopes) {
    function $ScriptError(){};
    var self = $ScriptError = $klass($base, $super, 'ScriptError', $ScriptError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'Exception', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $SyntaxError(){};
    var self = $SyntaxError = $klass($base, $super, 'SyntaxError', $SyntaxError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'ScriptError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $LoadError(){};
    var self = $LoadError = $klass($base, $super, 'LoadError', $LoadError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'ScriptError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $NotImplementedError(){};
    var self = $NotImplementedError = $klass($base, $super, 'NotImplementedError', $NotImplementedError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'ScriptError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $SystemExit(){};
    var self = $SystemExit = $klass($base, $super, 'SystemExit', $SystemExit);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'Exception', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $NoMemoryError(){};
    var self = $NoMemoryError = $klass($base, $super, 'NoMemoryError', $NoMemoryError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'Exception', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $SignalException(){};
    var self = $SignalException = $klass($base, $super, 'SignalException', $SignalException);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'Exception', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $Interrupt(){};
    var self = $Interrupt = $klass($base, $super, 'Interrupt', $Interrupt);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'Exception', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $SecurityError(){};
    var self = $SecurityError = $klass($base, $super, 'SecurityError', $SecurityError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'Exception', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $StandardError(){};
    var self = $StandardError = $klass($base, $super, 'StandardError', $StandardError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'Exception', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $ZeroDivisionError(){};
    var self = $ZeroDivisionError = $klass($base, $super, 'ZeroDivisionError', $ZeroDivisionError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $NameError(){};
    var self = $NameError = $klass($base, $super, 'NameError', $NameError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $NoMethodError(){};
    var self = $NoMethodError = $klass($base, $super, 'NoMethodError', $NoMethodError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'NameError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $RuntimeError(){};
    var self = $RuntimeError = $klass($base, $super, 'RuntimeError', $RuntimeError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $LocalJumpError(){};
    var self = $LocalJumpError = $klass($base, $super, 'LocalJumpError', $LocalJumpError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $TypeError(){};
    var self = $TypeError = $klass($base, $super, 'TypeError', $TypeError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $ArgumentError(){};
    var self = $ArgumentError = $klass($base, $super, 'ArgumentError', $ArgumentError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $IndexError(){};
    var self = $IndexError = $klass($base, $super, 'IndexError', $IndexError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $StopIteration(){};
    var self = $StopIteration = $klass($base, $super, 'StopIteration', $StopIteration);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'IndexError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $KeyError(){};
    var self = $KeyError = $klass($base, $super, 'KeyError', $KeyError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'IndexError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $RangeError(){};
    var self = $RangeError = $klass($base, $super, 'RangeError', $RangeError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $FloatDomainError(){};
    var self = $FloatDomainError = $klass($base, $super, 'FloatDomainError', $FloatDomainError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'RangeError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $IOError(){};
    var self = $IOError = $klass($base, $super, 'IOError', $IOError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $SystemCallError(){};
    var self = $SystemCallError = $klass($base, $super, 'SystemCallError', $SystemCallError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $visibility_scopes) {
    var $Errno, self = $Errno = $module($base, 'Errno');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    (function($base, $super, $visibility_scopes) {
      function $EINVAL(){};
      var self = $EINVAL = $klass($base, $super, 'EINVAL', $EINVAL);

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_EINVAL_new_9;

      return Opal.defs(self, '$new', TMP_EINVAL_new_9 = function() {
        var self = this, $iter = TMP_EINVAL_new_9.$$p, $yield = $iter || nil;

        TMP_EINVAL_new_9.$$p = null;
        return $send(self, Opal.find_super_dispatcher(self, 'new', TMP_EINVAL_new_9, false, $EINVAL), ["Invalid argument"], null)
      }, TMP_EINVAL_new_9.$$arity = 0)
    })($scope.base, Opal.const_get($scopes, 'SystemCallError', true, true), $scopes)
  })($scope.base, $scopes);
  (function($base, $super, $visibility_scopes) {
    function $UncaughtThrowError(){};
    var self = $UncaughtThrowError = $klass($base, $super, 'UncaughtThrowError', $UncaughtThrowError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_UncaughtThrowError_initialize_10;

    def.sym = nil;
    
    self.$attr_reader("sym", "arg");
    return (Opal.defn(self, '$initialize', TMP_UncaughtThrowError_initialize_10 = function $$initialize(args) {
      var $a, self = this, $iter = TMP_UncaughtThrowError_initialize_10.$$p, $yield = $iter || nil;

      TMP_UncaughtThrowError_initialize_10.$$p = null;
      
      self.sym = args['$[]'](0);
      if ((($a = $rb_gt(args.$length(), 1)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.arg = args['$[]'](1)};
      return $send(self, Opal.find_super_dispatcher(self, 'initialize', TMP_UncaughtThrowError_initialize_10, false), ["" + "uncaught throw " + (self.sym.$inspect())], null);
    }, TMP_UncaughtThrowError_initialize_10.$$arity = 1), nil) && 'initialize';
  })($scope.base, Opal.const_get($scopes, 'ArgumentError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $NameError(){};
    var self = $NameError = $klass($base, $super, 'NameError', $NameError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_NameError_initialize_11;

    
    self.$attr_reader("name");
    return (Opal.defn(self, '$initialize', TMP_NameError_initialize_11 = function $$initialize(message, name) {
      var self = this, $iter = TMP_NameError_initialize_11.$$p, $yield = $iter || nil;

      if (name == null) {
        name = nil;
      }
      TMP_NameError_initialize_11.$$p = null;
      
      $send(self, Opal.find_super_dispatcher(self, 'initialize', TMP_NameError_initialize_11, false), [message], null);
      return (self.name = name);
    }, TMP_NameError_initialize_11.$$arity = -2), nil) && 'initialize';
  })($scope.base, null, $scopes);
  (function($base, $super, $visibility_scopes) {
    function $NoMethodError(){};
    var self = $NoMethodError = $klass($base, $super, 'NoMethodError', $NoMethodError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_NoMethodError_initialize_12;

    
    self.$attr_reader("args");
    return (Opal.defn(self, '$initialize', TMP_NoMethodError_initialize_12 = function $$initialize(message, name, args) {
      var self = this, $iter = TMP_NoMethodError_initialize_12.$$p, $yield = $iter || nil;

      if (name == null) {
        name = nil;
      }
      if (args == null) {
        args = [];
      }
      TMP_NoMethodError_initialize_12.$$p = null;
      
      $send(self, Opal.find_super_dispatcher(self, 'initialize', TMP_NoMethodError_initialize_12, false), [message, name], null);
      return (self.args = args);
    }, TMP_NoMethodError_initialize_12.$$arity = -2), nil) && 'initialize';
  })($scope.base, null, $scopes);
  (function($base, $super, $visibility_scopes) {
    function $StopIteration(){};
    var self = $StopIteration = $klass($base, $super, 'StopIteration', $StopIteration);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return self.$attr_reader("result")
  })($scope.base, null, $scopes);
  return (function($base, $visibility_scopes) {
    var $JS, self = $JS = $module($base, 'JS');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    (function($base, $super, $visibility_scopes) {
      function $Error(){};
      var self = $Error = $klass($base, $super, 'Error', $Error);

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

      return nil
    })($scope.base, null, $scopes)
  })($scope.base, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/constants"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  
  Opal.cdecl($scope, 'RUBY_PLATFORM', "opal");
  Opal.cdecl($scope, 'RUBY_ENGINE', "opal");
  Opal.cdecl($scope, 'RUBY_VERSION', "2.3.0");
  Opal.cdecl($scope, 'RUBY_ENGINE_VERSION', "0.11.0.dev");
  Opal.cdecl($scope, 'RUBY_RELEASE_DATE', "2016-10-31");
  Opal.cdecl($scope, 'RUBY_PATCHLEVEL', 0);
  Opal.cdecl($scope, 'RUBY_REVISION', 0);
  Opal.cdecl($scope, 'RUBY_COPYRIGHT', "opal - Copyright (C) 2013-2015 Adam Beynon");
  return Opal.cdecl($scope, 'RUBY_DESCRIPTION', "" + "opal " + (Opal.const_get($scopes, 'RUBY_ENGINE_VERSION', true, true)) + " (" + (Opal.const_get($scopes, 'RUBY_RELEASE_DATE', true, true)) + " revision " + (Opal.const_get($scopes, 'RUBY_REVISION', true, true)) + ")");
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["opal/base"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  
  self.$require("corelib/runtime");
  self.$require("corelib/helpers");
  self.$require("corelib/module");
  self.$require("corelib/class");
  self.$require("corelib/basic_object");
  self.$require("corelib/kernel");
  self.$require("corelib/error");
  return self.$require("corelib/constants");
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/nil"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$class', '$new', '$>', '$length', '$Rational']);
  
  (function($base, $super, $visibility_scopes) {
    function $NilClass(){};
    var self = $NilClass = $klass($base, $super, 'NilClass', $NilClass);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_NilClass_$B_1, TMP_NilClass_$_2, TMP_NilClass_$_3, TMP_NilClass_$_4, TMP_NilClass_$eq$eq_5, TMP_NilClass_dup_6, TMP_NilClass_clone_7, TMP_NilClass_inspect_8, TMP_NilClass_nil$q_9, TMP_NilClass_singleton_class_10, TMP_NilClass_to_a_11, TMP_NilClass_to_h_12, TMP_NilClass_to_i_13, TMP_NilClass_to_s_14, TMP_NilClass_to_c_15, TMP_NilClass_rationalize_16, TMP_NilClass_to_r_17, TMP_NilClass_instance_variables_18;

    
    def.$$meta = self;
    Opal.defn(self, '$!', TMP_NilClass_$B_1 = function() {
      var self = this;

      return true
    }, TMP_NilClass_$B_1.$$arity = 0);
    Opal.defn(self, '$&', TMP_NilClass_$_2 = function(other) {
      var self = this;

      return false
    }, TMP_NilClass_$_2.$$arity = 1);
    Opal.defn(self, '$|', TMP_NilClass_$_3 = function(other) {
      var self = this;

      return other !== false && other !== nil
    }, TMP_NilClass_$_3.$$arity = 1);
    Opal.defn(self, '$^', TMP_NilClass_$_4 = function(other) {
      var self = this;

      return other !== false && other !== nil
    }, TMP_NilClass_$_4.$$arity = 1);
    Opal.defn(self, '$==', TMP_NilClass_$eq$eq_5 = function(other) {
      var self = this;

      return other === nil
    }, TMP_NilClass_$eq$eq_5.$$arity = 1);
    Opal.defn(self, '$dup', TMP_NilClass_dup_6 = function $$dup() {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't dup " + (self.$class()))
    }, TMP_NilClass_dup_6.$$arity = 0);
    Opal.defn(self, '$clone', TMP_NilClass_clone_7 = function $$clone() {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't clone " + (self.$class()))
    }, TMP_NilClass_clone_7.$$arity = 0);
    Opal.defn(self, '$inspect', TMP_NilClass_inspect_8 = function $$inspect() {
      var self = this;

      return "nil"
    }, TMP_NilClass_inspect_8.$$arity = 0);
    Opal.defn(self, '$nil?', TMP_NilClass_nil$q_9 = function() {
      var self = this;

      return true
    }, TMP_NilClass_nil$q_9.$$arity = 0);
    Opal.defn(self, '$singleton_class', TMP_NilClass_singleton_class_10 = function $$singleton_class() {
      var self = this;

      return Opal.const_get($scopes, 'NilClass', true, true)
    }, TMP_NilClass_singleton_class_10.$$arity = 0);
    Opal.defn(self, '$to_a', TMP_NilClass_to_a_11 = function $$to_a() {
      var self = this;

      return []
    }, TMP_NilClass_to_a_11.$$arity = 0);
    Opal.defn(self, '$to_h', TMP_NilClass_to_h_12 = function $$to_h() {
      var self = this;

      return Opal.hash()
    }, TMP_NilClass_to_h_12.$$arity = 0);
    Opal.defn(self, '$to_i', TMP_NilClass_to_i_13 = function $$to_i() {
      var self = this;

      return 0
    }, TMP_NilClass_to_i_13.$$arity = 0);
    Opal.alias(self, "to_f", "to_i");
    Opal.defn(self, '$to_s', TMP_NilClass_to_s_14 = function $$to_s() {
      var self = this;

      return ""
    }, TMP_NilClass_to_s_14.$$arity = 0);
    Opal.defn(self, '$to_c', TMP_NilClass_to_c_15 = function $$to_c() {
      var self = this;

      return Opal.const_get($scopes, 'Complex', true, true).$new(0, 0)
    }, TMP_NilClass_to_c_15.$$arity = 0);
    Opal.defn(self, '$rationalize', TMP_NilClass_rationalize_16 = function $$rationalize($a_rest) {
      var $b, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if ((($b = $rb_gt(args.$length(), 1)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true))};
      return self.$Rational(0, 1);
    }, TMP_NilClass_rationalize_16.$$arity = -1);
    Opal.defn(self, '$to_r', TMP_NilClass_to_r_17 = function $$to_r() {
      var self = this;

      return self.$Rational(0, 1)
    }, TMP_NilClass_to_r_17.$$arity = 0);
    return (Opal.defn(self, '$instance_variables', TMP_NilClass_instance_variables_18 = function $$instance_variables() {
      var self = this;

      return []
    }, TMP_NilClass_instance_variables_18.$$arity = 0), nil) && 'instance_variables';
  })($scope.base, null, $scopes);
  return Opal.cdecl($scope, 'NIL', nil);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/boolean"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$class']);
  
  (function($base, $super, $visibility_scopes) {
    function $Boolean(){};
    var self = $Boolean = $klass($base, $super, 'Boolean', $Boolean);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Boolean___id___1, TMP_Boolean_$B_2, TMP_Boolean_$_3, TMP_Boolean_$_4, TMP_Boolean_$_5, TMP_Boolean_$eq$eq_6, TMP_Boolean_singleton_class_7, TMP_Boolean_to_s_8, TMP_Boolean_dup_9, TMP_Boolean_clone_10;

    
    def.$$is_boolean = true;
    def.$$meta = self;
    Opal.defn(self, '$__id__', TMP_Boolean___id___1 = function $$__id__() {
      var self = this;

      return self.valueOf() ? 2 : 0
    }, TMP_Boolean___id___1.$$arity = 0);
    Opal.alias(self, "object_id", "__id__");
    Opal.defn(self, '$!', TMP_Boolean_$B_2 = function() {
      var self = this;

      return self != true
    }, TMP_Boolean_$B_2.$$arity = 0);
    Opal.defn(self, '$&', TMP_Boolean_$_3 = function(other) {
      var self = this;

      return (self == true) ? (other !== false && other !== nil) : false
    }, TMP_Boolean_$_3.$$arity = 1);
    Opal.defn(self, '$|', TMP_Boolean_$_4 = function(other) {
      var self = this;

      return (self == true) ? true : (other !== false && other !== nil)
    }, TMP_Boolean_$_4.$$arity = 1);
    Opal.defn(self, '$^', TMP_Boolean_$_5 = function(other) {
      var self = this;

      return (self == true) ? (other === false || other === nil) : (other !== false && other !== nil)
    }, TMP_Boolean_$_5.$$arity = 1);
    Opal.defn(self, '$==', TMP_Boolean_$eq$eq_6 = function(other) {
      var self = this;

      return (self == true) === other.valueOf()
    }, TMP_Boolean_$eq$eq_6.$$arity = 1);
    Opal.alias(self, "equal?", "==");
    Opal.alias(self, "eql?", "==");
    Opal.defn(self, '$singleton_class', TMP_Boolean_singleton_class_7 = function $$singleton_class() {
      var self = this;

      return Opal.const_get($scopes, 'Boolean', true, true)
    }, TMP_Boolean_singleton_class_7.$$arity = 0);
    Opal.defn(self, '$to_s', TMP_Boolean_to_s_8 = function $$to_s() {
      var self = this;

      return (self == true) ? 'true' : 'false'
    }, TMP_Boolean_to_s_8.$$arity = 0);
    Opal.defn(self, '$dup', TMP_Boolean_dup_9 = function $$dup() {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't dup " + (self.$class()))
    }, TMP_Boolean_dup_9.$$arity = 0);
    return (Opal.defn(self, '$clone', TMP_Boolean_clone_10 = function $$clone() {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't clone " + (self.$class()))
    }, TMP_Boolean_clone_10.$$arity = 0), nil) && 'clone';
  })($scope.base, Boolean, $scopes);
  Opal.cdecl($scope, 'TrueClass', Opal.const_get($scopes, 'Boolean', true, true));
  Opal.cdecl($scope, 'FalseClass', Opal.const_get($scopes, 'Boolean', true, true));
  Opal.cdecl($scope, 'TRUE', true);
  return Opal.cdecl($scope, 'FALSE', false);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/comparable"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$===', '$>', '$<', '$equal?', '$<=>', '$normalize', '$raise', '$class']);
  return (function($base, $visibility_scopes) {
    var $Comparable, self = $Comparable = $module($base, 'Comparable');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Comparable_normalize_1, TMP_Comparable_$eq$eq_2, TMP_Comparable_$gt_3, TMP_Comparable_$gt$eq_4, TMP_Comparable_$lt_5, TMP_Comparable_$lt$eq_6, TMP_Comparable_between$q_7;

    
    Opal.defs(self, '$normalize', TMP_Comparable_normalize_1 = function $$normalize(what) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](what)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return what};
      if ((($a = $rb_gt(what, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 1};
      if ((($a = $rb_lt(what, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return -1};
      return 0;
    }, TMP_Comparable_normalize_1.$$arity = 1);
    Opal.defn(self, '$==', TMP_Comparable_$eq$eq_2 = function(other) {
      var $a, self = this, cmp = nil;

      try {
        
        if ((($a = self['$equal?'](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return true};
        
      if (self["$<=>"] == Opal.Kernel["$<=>"]) {
        return false;
      }

      // check for infinite recursion
      if (self.$$comparable) {
        delete self.$$comparable;
        return false;
      }
    ;
        if ((($a = (cmp = self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          return false
        };
        return Opal.const_get($scopes, 'Comparable', true, true).$normalize(cmp) == 0;
      } catch ($err) {
        if (Opal.rescue($err, [Opal.const_get($scopes, 'StandardError', true, true)])) {
          try {
            return false
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      }
    }, TMP_Comparable_$eq$eq_2.$$arity = 1);
    Opal.defn(self, '$>', TMP_Comparable_$gt_3 = function(other) {
      var $a, self = this, cmp = nil;

      
      if ((($a = (cmp = self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return Opal.const_get($scopes, 'Comparable', true, true).$normalize(cmp) > 0;
    }, TMP_Comparable_$gt_3.$$arity = 1);
    Opal.defn(self, '$>=', TMP_Comparable_$gt$eq_4 = function(other) {
      var $a, self = this, cmp = nil;

      
      if ((($a = (cmp = self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return Opal.const_get($scopes, 'Comparable', true, true).$normalize(cmp) >= 0;
    }, TMP_Comparable_$gt$eq_4.$$arity = 1);
    Opal.defn(self, '$<', TMP_Comparable_$lt_5 = function(other) {
      var $a, self = this, cmp = nil;

      
      if ((($a = (cmp = self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return Opal.const_get($scopes, 'Comparable', true, true).$normalize(cmp) < 0;
    }, TMP_Comparable_$lt_5.$$arity = 1);
    Opal.defn(self, '$<=', TMP_Comparable_$lt$eq_6 = function(other) {
      var $a, self = this, cmp = nil;

      
      if ((($a = (cmp = self['$<=>'](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")
      };
      return Opal.const_get($scopes, 'Comparable', true, true).$normalize(cmp) <= 0;
    }, TMP_Comparable_$lt$eq_6.$$arity = 1);
    Opal.defn(self, '$between?', TMP_Comparable_between$q_7 = function(min, max) {
      var self = this;

      
      if ($rb_lt(self, min)) {
        return false};
      if ($rb_gt(self, max)) {
        return false};
      return true;
    }, TMP_Comparable_between$q_7.$$arity = 2);
  })($scope.base, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/regexp"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send, $gvars = Opal.gvars;

  Opal.add_stubs(['$nil?', '$[]', '$raise', '$escape', '$options', '$to_str', '$new', '$join', '$coerce_to!', '$!', '$match', '$coerce_to?', '$begin', '$coerce_to', '$call', '$=~', '$attr_reader', '$===', '$inspect', '$to_a']);
  
  (function($base, $super, $visibility_scopes) {
    function $RegexpError(){};
    var self = $RegexpError = $klass($base, $super, 'RegexpError', $RegexpError);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return nil
  })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
  (function($base, $super, $visibility_scopes) {
    function $Regexp(){};
    var self = $Regexp = $klass($base, $super, 'Regexp', $Regexp);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Regexp_$eq$eq_6, TMP_Regexp_$eq$eq$eq_7, TMP_Regexp_$eq$_8, TMP_Regexp_inspect_9, TMP_Regexp_match_10, TMP_Regexp_$_11, TMP_Regexp_source_12, TMP_Regexp_options_13, TMP_Regexp_casefold$q_14, TMP_Regexp__load_15;

    
    Opal.cdecl($scope, 'IGNORECASE', 1);
    Opal.cdecl($scope, 'MULTILINE', 4);
    def.$$is_regexp = true;
    (function(self, $visibility_scopes) {
      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat(self), TMP_allocate_1, TMP_escape_2, TMP_last_match_3, TMP_union_4, TMP_new_5;

      
      Opal.defn(self, '$allocate', TMP_allocate_1 = function $$allocate() {
        var self = this, $iter = TMP_allocate_1.$$p, $yield = $iter || nil, allocated = nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

        TMP_allocate_1.$$p = null;
        // Prepare super implicit arguments
        for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
          $zuper[$zuper_i] = arguments[$zuper_i];
        }
        
        allocated = $send(self, Opal.find_super_dispatcher(self, 'allocate', TMP_allocate_1, false), $zuper, $iter);
        allocated.uninitialized = true;
        return allocated;
      }, TMP_allocate_1.$$arity = 0);
      Opal.defn(self, '$escape', TMP_escape_2 = function $$escape(string) {
        var self = this;

        return Opal.escape_regexp(string)
      }, TMP_escape_2.$$arity = 1);
      Opal.defn(self, '$last_match', TMP_last_match_3 = function $$last_match(n) {
        var $a, self = this;
        if ($gvars["~"] == null) $gvars["~"] = nil;

        if (n == null) {
          n = nil;
        }
        if ((($a = n['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return $gvars["~"]
          } else {
          return $gvars["~"]['$[]'](n)
        }
      }, TMP_last_match_3.$$arity = -1);
      Opal.alias(self, "quote", "escape");
      Opal.defn(self, '$union', TMP_union_4 = function $$union($a_rest) {
        var self = this, parts;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        parts = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          parts[$arg_idx - 0] = arguments[$arg_idx];
        }
        
        
        var is_first_part_array, quoted_validated, part, options, each_part_options;
        if (parts.length == 0) {
          return /(?!)/;
        }
        // cover the 2 arrays passed as arguments case
        is_first_part_array = parts[0].$$is_array;
        if (parts.length > 1 && is_first_part_array) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "no implicit conversion of Array into String")
        }
        // deal with splat issues (related to https://github.com/opal/opal/issues/858)
        if (is_first_part_array) {
          parts = parts[0];
        }
        options = undefined;
        quoted_validated = [];
        for (var i=0; i < parts.length; i++) {
          part = parts[i];
          if (part.$$is_string) {
            quoted_validated.push(self.$escape(part));
          }
          else if (part.$$is_regexp) {
            each_part_options = (part).$options();
            if (options != undefined && options != each_part_options) {
              self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "All expressions must use the same options")
            }
            options = each_part_options;
            quoted_validated.push('('+part.source+')');
          }
          else {
            quoted_validated.push(self.$escape((part).$to_str()));
          }
        }
      ;
        return self.$new((quoted_validated).$join("|"), options);
      }, TMP_union_4.$$arity = -1);
      return (Opal.defn(self, '$new', TMP_new_5 = function(regexp, options) {
        var self = this;

        
        if (regexp.$$is_regexp) {
          return new RegExp(regexp);
        }

        regexp = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](regexp, Opal.const_get($scopes, 'String', true, true), "to_str");

        if (regexp.charAt(regexp.length - 1) === '\\' && regexp.charAt(regexp.length - 2) !== '\\') {
          self.$raise(Opal.const_get($scopes, 'RegexpError', true, true), "" + "too short escape sequence: /" + (regexp) + "/")
        }

        if (options === undefined || options['$!']()) {
          return new RegExp(regexp);
        }

        if (options.$$is_number) {
          var temp = '';
          if (Opal.const_get($scopes, 'IGNORECASE', true, true) & options) { temp += 'i'; }
          if (Opal.const_get($scopes, 'MULTILINE', true, true)  & options) { temp += 'm'; }
          options = temp;
        }
        else {
          options = 'i';
        }

        return new RegExp(regexp, options);
      
      }, TMP_new_5.$$arity = -2), nil) && 'new';
    })(Opal.get_singleton_class(self), $scopes);
    Opal.defn(self, '$==', TMP_Regexp_$eq$eq_6 = function(other) {
      var self = this;

      return other.constructor == RegExp && self.toString() === other.toString()
    }, TMP_Regexp_$eq$eq_6.$$arity = 1);
    Opal.defn(self, '$===', TMP_Regexp_$eq$eq$eq_7 = function(string) {
      var self = this;

      return self.$match(Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](string, Opal.const_get($scopes, 'String', true, true), "to_str")) !== nil
    }, TMP_Regexp_$eq$eq$eq_7.$$arity = 1);
    Opal.defn(self, '$=~', TMP_Regexp_$eq$_8 = function(string) {
      var $a, self = this;
      if ($gvars["~"] == null) $gvars["~"] = nil;

      return ($a = self.$match(string), $a !== false && $a !== nil && $a != null ?$gvars["~"].$begin(0) : $a)
    }, TMP_Regexp_$eq$_8.$$arity = 1);
    Opal.alias(self, "eql?", "==");
    Opal.defn(self, '$inspect', TMP_Regexp_inspect_9 = function $$inspect() {
      var self = this;

      
      var regexp_format = /^\/(.*)\/([^\/]*)$/;
      var value = self.toString();
      var matches = regexp_format.exec(value);
      if (matches) {
        var regexp_pattern = matches[1];
        var regexp_flags = matches[2];
        var chars = regexp_pattern.split('');
        var chars_length = chars.length;
        var char_escaped = false;
        var regexp_pattern_escaped = '';
        for (var i = 0; i < chars_length; i++) {
          var current_char = chars[i];
          if (!char_escaped && current_char == '/') {
            regexp_pattern_escaped = regexp_pattern_escaped.concat('\\');
          }
          regexp_pattern_escaped = regexp_pattern_escaped.concat(current_char);
          if (current_char == '\\') {
            if (char_escaped) {
              // does not over escape
              char_escaped = false;
            } else {
              char_escaped = true;
            }
          } else {
            char_escaped = false;
          }
        }
        return '/' + regexp_pattern_escaped + '/' + regexp_flags;
      } else {
        return value;
      }
    
    }, TMP_Regexp_inspect_9.$$arity = 0);
    Opal.defn(self, '$match', TMP_Regexp_match_10 = function $$match(string, pos) {
      var self = this, $iter = TMP_Regexp_match_10.$$p, block = $iter || nil;
      if ($gvars["~"] == null) $gvars["~"] = nil;

      TMP_Regexp_match_10.$$p = null;
      
      if (self.uninitialized) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "uninitialized Regexp")
      }

      if (pos === undefined) {
        pos = 0;
      } else {
        pos = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(pos, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }

      if (string === nil) {
        return ($gvars["~"] = nil);
      }

      string = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(string, Opal.const_get($scopes, 'String', true, true), "to_str");

      if (pos < 0) {
        pos += string.length;
        if (pos < 0) {
          return ($gvars["~"] = nil);
        }
      }

      var source = self.source;
      var flags = 'g';
      // m flag + a . in Ruby will match white space, but in JS, it only matches beginning/ending of lines, so we get the equivalent here
      if (self.multiline) {
        source = source.replace('.', "[\\s\\S]");
        flags += 'm';
      }

      // global RegExp maintains state, so not using self/this
      var md, re = new RegExp(source, flags + (self.ignoreCase ? 'i' : ''));

      while (true) {
        md = re.exec(string);
        if (md === null) {
          return ($gvars["~"] = nil);
        }
        if (md.index >= pos) {
          ($gvars["~"] = Opal.const_get($scopes, 'MatchData', true, true).$new(re, md))
          return block === nil ? $gvars["~"] : block.$call($gvars["~"]);
        }
        re.lastIndex = md.index + 1;
      }
    
    }, TMP_Regexp_match_10.$$arity = -2);
    Opal.defn(self, '$~', TMP_Regexp_$_11 = function() {
      var self = this;
      if ($gvars._ == null) $gvars._ = nil;

      return self['$=~']($gvars._)
    }, TMP_Regexp_$_11.$$arity = 0);
    Opal.defn(self, '$source', TMP_Regexp_source_12 = function $$source() {
      var self = this;

      return self.source
    }, TMP_Regexp_source_12.$$arity = 0);
    Opal.defn(self, '$options', TMP_Regexp_options_13 = function $$options() {
      var self = this;

      
      if (self.uninitialized) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "uninitialized Regexp")
      }
      var result = 0;
      // should be supported in IE6 according to https://msdn.microsoft.com/en-us/library/7f5z26w4(v=vs.94).aspx
      if (self.multiline) {
        result |= Opal.const_get($scopes, 'MULTILINE', true, true);
      }
      if (self.ignoreCase) {
        result |= Opal.const_get($scopes, 'IGNORECASE', true, true);
      }
      return result;
    
    }, TMP_Regexp_options_13.$$arity = 0);
    Opal.defn(self, '$casefold?', TMP_Regexp_casefold$q_14 = function() {
      var self = this;

      return self.ignoreCase
    }, TMP_Regexp_casefold$q_14.$$arity = 0);
    Opal.alias(self, "to_s", "source");
    return Opal.defs(self, '$_load', TMP_Regexp__load_15 = function $$_load(args) {
      var self = this;

      return $send(self, 'new', Opal.to_a(args))
    }, TMP_Regexp__load_15.$$arity = 1);
  })($scope.base, RegExp, $scopes);
  return (function($base, $super, $visibility_scopes) {
    function $MatchData(){};
    var self = $MatchData = $klass($base, $super, 'MatchData', $MatchData);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_MatchData_initialize_16, TMP_MatchData_$$_17, TMP_MatchData_offset_18, TMP_MatchData_$eq$eq_19, TMP_MatchData_begin_20, TMP_MatchData_end_21, TMP_MatchData_captures_22, TMP_MatchData_inspect_23, TMP_MatchData_length_24, TMP_MatchData_to_a_25, TMP_MatchData_to_s_26, TMP_MatchData_values_at_27;

    def.matches = nil;
    
    self.$attr_reader("post_match", "pre_match", "regexp", "string");
    Opal.defn(self, '$initialize', TMP_MatchData_initialize_16 = function $$initialize(regexp, match_groups) {
      var self = this;

      
      $gvars["~"] = self;
      self.regexp = regexp;
      self.begin = match_groups.index;
      self.string = match_groups.input;
      self.pre_match = match_groups.input.slice(0, match_groups.index);
      self.post_match = match_groups.input.slice(match_groups.index + match_groups[0].length);
      self.matches = [];
      
      for (var i = 0, length = match_groups.length; i < length; i++) {
        var group = match_groups[i];

        if (group == null) {
          self.matches.push(nil);
        }
        else {
          self.matches.push(group);
        }
      }
    ;
    }, TMP_MatchData_initialize_16.$$arity = 2);
    Opal.defn(self, '$[]', TMP_MatchData_$$_17 = function($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return $send(self.matches, '[]', Opal.to_a(args))
    }, TMP_MatchData_$$_17.$$arity = -1);
    Opal.defn(self, '$offset', TMP_MatchData_offset_18 = function $$offset(n) {
      var self = this;

      
      if (n !== 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "MatchData#offset only supports 0th element")
      }
      return [self.begin, self.begin + self.matches[n].length];
    
    }, TMP_MatchData_offset_18.$$arity = 1);
    Opal.defn(self, '$==', TMP_MatchData_$eq$eq_19 = function(other) {
      var $a, $b, $c, $d, self = this;

      
      if ((($a = Opal.const_get($scopes, 'MatchData', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      return ($a = ($b = ($c = ($d = self.string == other.string, $d !== false && $d !== nil && $d != null ?self.regexp.toString() == other.regexp.toString() : $d), $c !== false && $c !== nil && $c != null ?self.pre_match == other.pre_match : $c), $b !== false && $b !== nil && $b != null ?self.post_match == other.post_match : $b), $a !== false && $a !== nil && $a != null ?self.begin == other.begin : $a);
    }, TMP_MatchData_$eq$eq_19.$$arity = 1);
    Opal.alias(self, "eql?", "==");
    Opal.defn(self, '$begin', TMP_MatchData_begin_20 = function $$begin(n) {
      var self = this;

      
      if (n !== 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "MatchData#begin only supports 0th element")
      }
      return self.begin;
    
    }, TMP_MatchData_begin_20.$$arity = 1);
    Opal.defn(self, '$end', TMP_MatchData_end_21 = function $$end(n) {
      var self = this;

      
      if (n !== 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "MatchData#end only supports 0th element")
      }
      return self.begin + self.matches[n].length;
    
    }, TMP_MatchData_end_21.$$arity = 1);
    Opal.defn(self, '$captures', TMP_MatchData_captures_22 = function $$captures() {
      var self = this;

      return self.matches.slice(1)
    }, TMP_MatchData_captures_22.$$arity = 0);
    Opal.defn(self, '$inspect', TMP_MatchData_inspect_23 = function $$inspect() {
      var self = this;

      
      var str = "#<MatchData " + (self.matches[0]).$inspect();

      for (var i = 1, length = self.matches.length; i < length; i++) {
        str += " " + i + ":" + (self.matches[i]).$inspect();
      }

      return str + ">";
    
    }, TMP_MatchData_inspect_23.$$arity = 0);
    Opal.defn(self, '$length', TMP_MatchData_length_24 = function $$length() {
      var self = this;

      return self.matches.length
    }, TMP_MatchData_length_24.$$arity = 0);
    Opal.alias(self, "size", "length");
    Opal.defn(self, '$to_a', TMP_MatchData_to_a_25 = function $$to_a() {
      var self = this;

      return self.matches
    }, TMP_MatchData_to_a_25.$$arity = 0);
    Opal.defn(self, '$to_s', TMP_MatchData_to_s_26 = function $$to_s() {
      var self = this;

      return self.matches[0]
    }, TMP_MatchData_to_s_26.$$arity = 0);
    return (Opal.defn(self, '$values_at', TMP_MatchData_values_at_27 = function $$values_at($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var i, a, index, values = [];

      for (i = 0; i < args.length; i++) {

        if (args[i].$$is_range) {
          a = (args[i]).$to_a();
          a.unshift(i, 1);
          Array.prototype.splice.apply(args, a);
        }

        index = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](args[i], Opal.const_get($scopes, 'Integer', true, true), "to_int");

        if (index < 0) {
          index += self.matches.length;
          if (index < 0) {
            values.push(nil);
            continue;
          }
        }

        values.push(self.matches[index]);
      }

      return values;
    
    }, TMP_MatchData_values_at_27.$$arity = -1), nil) && 'values_at';
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/string"] = function(Opal) {
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$include', '$coerce_to?', '$coerce_to', '$raise', '$===', '$format', '$to_s', '$respond_to?', '$to_str', '$<=>', '$==', '$=~', '$new', '$empty?', '$ljust', '$ceil', '$/', '$+', '$rjust', '$floor', '$to_a', '$each_char', '$to_proc', '$coerce_to!', '$copy_singleton_methods', '$initialize_clone', '$initialize_dup', '$enum_for', '$size', '$chomp', '$[]', '$to_i', '$each_line', '$class', '$match', '$captures', '$proc', '$shift', '$__send__', '$succ', '$escape']);
  
  self.$require("corelib/comparable");
  self.$require("corelib/regexp");
  (function($base, $super, $visibility_scopes) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_String___id___1, TMP_String_try_convert_2, TMP_String_new_3, TMP_String_initialize_4, TMP_String_$_5, TMP_String_$_6, TMP_String_$_7, TMP_String_$lt$eq$gt_8, TMP_String_$eq$eq_9, TMP_String_$eq$_10, TMP_String_$$_11, TMP_String_capitalize_12, TMP_String_casecmp_13, TMP_String_center_14, TMP_String_chars_15, TMP_String_chomp_16, TMP_String_chop_17, TMP_String_chr_18, TMP_String_clone_19, TMP_String_dup_20, TMP_String_count_21, TMP_String_delete_22, TMP_String_downcase_23, TMP_String_each_char_24, TMP_String_each_line_26, TMP_String_empty$q_27, TMP_String_end_with$q_28, TMP_String_gsub_29, TMP_String_hash_30, TMP_String_hex_31, TMP_String_include$q_32, TMP_String_index_33, TMP_String_inspect_34, TMP_String_intern_35, TMP_String_lines_36, TMP_String_length_37, TMP_String_ljust_38, TMP_String_lstrip_39, TMP_String_ascii_only$q_40, TMP_String_match_41, TMP_String_next_42, TMP_String_oct_43, TMP_String_ord_44, TMP_String_partition_45, TMP_String_reverse_46, TMP_String_rindex_47, TMP_String_rjust_48, TMP_String_rpartition_49, TMP_String_rstrip_50, TMP_String_scan_51, TMP_String_split_52, TMP_String_squeeze_53, TMP_String_start_with$q_54, TMP_String_strip_55, TMP_String_sub_56, TMP_String_sum_57, TMP_String_swapcase_58, TMP_String_to_f_59, TMP_String_to_i_60, TMP_String_to_proc_62, TMP_String_to_s_63, TMP_String_tr_64, TMP_String_tr_s_65, TMP_String_upcase_66, TMP_String_upto_67, TMP_String_instance_variables_68, TMP_String__load_69, TMP_String_unpack_70;

    def.length = nil;
    
    self.$include(Opal.const_get($scopes, 'Comparable', true, true));
    def.$$is_string = true;
    Opal.defn(self, '$__id__', TMP_String___id___1 = function $$__id__() {
      var self = this;

      return self.toString()
    }, TMP_String___id___1.$$arity = 0);
    Opal.alias(self, "object_id", "__id__");
    Opal.defs(self, '$try_convert', TMP_String_try_convert_2 = function $$try_convert(what) {
      var self = this;

      return Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](what, Opal.const_get($scopes, 'String', true, true), "to_str")
    }, TMP_String_try_convert_2.$$arity = 1);
    Opal.defs(self, '$new', TMP_String_new_3 = function(str) {
      var self = this;

      if (str == null) {
        str = "";
      }
      
      str = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(str, Opal.const_get($scopes, 'String', true, true), "to_str");
      return new String(str);
    }, TMP_String_new_3.$$arity = -1);
    Opal.defn(self, '$initialize', TMP_String_initialize_4 = function $$initialize(str) {
      var self = this;

      
      
      if (str === undefined) {
        return self;
      }
    ;
      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), "Mutable strings are not supported in Opal.");
    }, TMP_String_initialize_4.$$arity = -1);
    Opal.defn(self, '$%', TMP_String_$_5 = function(data) {
      var $a, self = this;

      if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](data)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $send(self, 'format', [self].concat(Opal.to_a(data)))
        } else {
        return self.$format(self, data)
      }
    }, TMP_String_$_5.$$arity = 1);
    Opal.defn(self, '$*', TMP_String_$_6 = function(count) {
      var self = this;

      
      count = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(count, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      if (count < 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "negative argument")
      }

      if (count === 0) {
        return '';
      }

      var result = '',
          string = self.toString();

      // All credit for the bit-twiddling magic code below goes to Mozilla
      // polyfill implementation of String.prototype.repeat() posted here:
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat

      if (string.length * count >= 1 << 28) {
        self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "multiply count must not overflow maximum string size")
      }

      for (;;) {
        if ((count & 1) === 1) {
          result += string;
        }
        count >>>= 1;
        if (count === 0) {
          break;
        }
        string += string;
      }

      return result;
    
    }, TMP_String_$_6.$$arity = 1);
    Opal.defn(self, '$+', TMP_String_$_7 = function(other) {
      var self = this;

      
      other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'String', true, true), "to_str");
      return self + other.$to_s();
    }, TMP_String_$_7.$$arity = 1);
    Opal.defn(self, '$<=>', TMP_String_$lt$eq$gt_8 = function(other) {
      var $a, self = this;

      if ((($a = other['$respond_to?']("to_str")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        other = other.$to_str().$to_s();
        return self > other ? 1 : (self < other ? -1 : 0);
        } else {
        
        var cmp = other['$<=>'](self);

        if (cmp === nil) {
          return nil;
        }
        else {
          return cmp > 0 ? -1 : (cmp < 0 ? 1 : 0);
        }
      
      }
    }, TMP_String_$lt$eq$gt_8.$$arity = 1);
    Opal.defn(self, '$==', TMP_String_$eq$eq_9 = function(other) {
      var self = this;

      
      if (other.$$is_string) {
        return self.toString() === other.toString();
      }
      if (Opal.const_get($scopes, 'Opal', true, true)['$respond_to?'](other, "to_str")) {
        return other['$=='](self);
      }
      return false;
    
    }, TMP_String_$eq$eq_9.$$arity = 1);
    Opal.alias(self, "eql?", "==");
    Opal.alias(self, "===", "==");
    Opal.defn(self, '$=~', TMP_String_$eq$_10 = function(other) {
      var self = this;

      
      if (other.$$is_string) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "type mismatch: String given");
      }

      return other['$=~'](self);
    
    }, TMP_String_$eq$_10.$$arity = 1);
    Opal.defn(self, '$[]', TMP_String_$$_11 = function(index, length) {
      var self = this;

      
      var size = self.length, exclude;

      if (index.$$is_range) {
        exclude = index.exclude;
        length  = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index.end, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        index   = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index.begin, Opal.const_get($scopes, 'Integer', true, true), "to_int");

        if (Math.abs(index) > size) {
          return nil;
        }

        if (index < 0) {
          index += size;
        }

        if (length < 0) {
          length += size;
        }

        if (!exclude) {
          length += 1;
        }

        length = length - index;

        if (length < 0) {
          length = 0;
        }

        return self.substr(index, length);
      }


      if (index.$$is_string) {
        if (length != null) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true))
        }
        return self.indexOf(index) !== -1 ? index : nil;
      }


      if (index.$$is_regexp) {
        var match = self.match(index);

        if (match === null) {
          ($gvars["~"] = nil)
          return nil;
        }

        ($gvars["~"] = Opal.const_get($scopes, 'MatchData', true, true).$new(index, match))

        if (length == null) {
          return match[0];
        }

        length = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(length, Opal.const_get($scopes, 'Integer', true, true), "to_int");

        if (length < 0 && -length < match.length) {
          return match[length += match.length];
        }

        if (length >= 0 && length < match.length) {
          return match[length];
        }

        return nil;
      }


      index = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      if (index < 0) {
        index += size;
      }

      if (length == null) {
        if (index >= size || index < 0) {
          return nil;
        }
        return self.substr(index, 1);
      }

      length = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(length, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      if (length < 0) {
        return nil;
      }

      if (index > size || index < 0) {
        return nil;
      }

      return self.substr(index, length);
    
    }, TMP_String_$$_11.$$arity = -2);
    Opal.alias(self, "byteslice", "[]");
    Opal.defn(self, '$capitalize', TMP_String_capitalize_12 = function $$capitalize() {
      var self = this;

      return self.charAt(0).toUpperCase() + self.substr(1).toLowerCase()
    }, TMP_String_capitalize_12.$$arity = 0);
    Opal.defn(self, '$casecmp', TMP_String_casecmp_13 = function $$casecmp(other) {
      var self = this;

      
      other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
      
      var ascii_only = /^[\x00-\x7F]*$/;
      if (ascii_only.test(self) && ascii_only.test(other)) {
        self = self.toLowerCase();
        other = other.toLowerCase();
      }
    ;
      return self['$<=>'](other);
    }, TMP_String_casecmp_13.$$arity = 1);
    Opal.defn(self, '$center', TMP_String_center_14 = function $$center(width, padstr) {
      var $a, self = this;

      if (padstr == null) {
        padstr = " ";
      }
      
      width = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(width, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      padstr = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(padstr, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
      if ((($a = padstr['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "zero width padding")};
      if ((($a = width <= self.length) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      var ljustified = self.$ljust($rb_divide($rb_plus(width, self.length), 2).$ceil(), padstr),
          rjustified = self.$rjust($rb_divide($rb_plus(width, self.length), 2).$floor(), padstr);

      return rjustified + ljustified.slice(self.length);
    ;
    }, TMP_String_center_14.$$arity = -2);
    Opal.defn(self, '$chars', TMP_String_chars_15 = function $$chars() {
      var self = this, $iter = TMP_String_chars_15.$$p, block = $iter || nil;

      TMP_String_chars_15.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return self.$each_char().$to_a()
      };
      return $send(self, 'each_char', [], block.$to_proc());
    }, TMP_String_chars_15.$$arity = 0);
    Opal.defn(self, '$chomp', TMP_String_chomp_16 = function $$chomp(separator) {
      var $a, self = this;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      
      if ((($a = separator === nil || self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      separator = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](separator, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
      
      if (separator === "\n") {
        return self.replace(/\r?\n?$/, '');
      }
      else if (separator === "") {
        return self.replace(/(\r?\n)+$/, '');
      }
      else if (self.length > separator.length) {
        var tail = self.substr(self.length - separator.length, separator.length);

        if (tail === separator) {
          return self.substr(0, self.length - separator.length);
        }
      }
    ;
      return self;
    }, TMP_String_chomp_16.$$arity = -1);
    Opal.defn(self, '$chop', TMP_String_chop_17 = function $$chop() {
      var self = this;

      
      var length = self.length;

      if (length <= 1) {
        return "";
      }

      if (self.charAt(length - 1) === "\n" && self.charAt(length - 2) === "\r") {
        return self.substr(0, length - 2);
      }
      else {
        return self.substr(0, length - 1);
      }
    
    }, TMP_String_chop_17.$$arity = 0);
    Opal.defn(self, '$chr', TMP_String_chr_18 = function $$chr() {
      var self = this;

      return self.charAt(0)
    }, TMP_String_chr_18.$$arity = 0);
    Opal.defn(self, '$clone', TMP_String_clone_19 = function $$clone() {
      var self = this, copy = nil;

      
      copy = self.slice();
      copy.$copy_singleton_methods(self);
      copy.$initialize_clone(self);
      return copy;
    }, TMP_String_clone_19.$$arity = 0);
    Opal.defn(self, '$dup', TMP_String_dup_20 = function $$dup() {
      var self = this, copy = nil;

      
      copy = self.slice();
      copy.$initialize_dup(self);
      return copy;
    }, TMP_String_dup_20.$$arity = 0);
    Opal.defn(self, '$count', TMP_String_count_21 = function $$count($a_rest) {
      var self = this, sets;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      sets = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        sets[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (sets.length === 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "ArgumentError: wrong number of arguments (0 for 1+)")
      }
      var char_class = char_class_from_char_sets(sets);
      if (char_class === null) {
        return 0;
      }
      return self.length - self.replace(new RegExp(char_class, 'g'), '').length;
    
    }, TMP_String_count_21.$$arity = -1);
    Opal.defn(self, '$delete', TMP_String_delete_22 = function($a_rest) {
      var self = this, sets;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      sets = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        sets[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (sets.length === 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "ArgumentError: wrong number of arguments (0 for 1+)")
      }
      var char_class = char_class_from_char_sets(sets);
      if (char_class === null) {
        return self;
      }
      return self.replace(new RegExp(char_class, 'g'), '');
    
    }, TMP_String_delete_22.$$arity = -1);
    Opal.defn(self, '$downcase', TMP_String_downcase_23 = function $$downcase() {
      var self = this;

      return self.toLowerCase()
    }, TMP_String_downcase_23.$$arity = 0);
    Opal.defn(self, '$each_char', TMP_String_each_char_24 = function $$each_char() {
      var TMP_25, self = this, $iter = TMP_String_each_char_24.$$p, block = $iter || nil;

      TMP_String_each_char_24.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["each_char"], (TMP_25 = function(){var self = TMP_25.$$s || this;

        return self.$size()}, TMP_25.$$s = self, TMP_25.$$arity = 0, TMP_25))
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        Opal.yield1(block, self.charAt(i));
      }
    ;
      return self;
    }, TMP_String_each_char_24.$$arity = 0);
    Opal.defn(self, '$each_line', TMP_String_each_line_26 = function $$each_line(separator) {
      var self = this, $iter = TMP_String_each_line_26.$$p, block = $iter || nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      TMP_String_each_line_26.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return self.$enum_for("each_line", separator)
      };
      
      if (separator === nil) {
        Opal.yield1(block, self);

        return self;
      }

      separator = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(separator, Opal.const_get($scopes, 'String', true, true), "to_str")

      var a, i, n, length, chomped, trailing, splitted;

      if (separator.length === 0) {
        for (a = self.split(/(\n{2,})/), i = 0, n = a.length; i < n; i += 2) {
          if (a[i] || a[i + 1]) {
            Opal.yield1(block, (a[i] || "") + (a[i + 1] || ""));
          }
        }

        return self;
      }

      chomped  = self.$chomp(separator);
      trailing = self.length != chomped.length;
      splitted = chomped.split(separator);

      for (i = 0, length = splitted.length; i < length; i++) {
        if (i < length - 1 || trailing) {
          Opal.yield1(block, splitted[i] + separator);
        }
        else {
          Opal.yield1(block, splitted[i]);
        }
      }
    ;
      return self;
    }, TMP_String_each_line_26.$$arity = -1);
    Opal.defn(self, '$empty?', TMP_String_empty$q_27 = function() {
      var self = this;

      return self.length === 0
    }, TMP_String_empty$q_27.$$arity = 0);
    Opal.defn(self, '$end_with?', TMP_String_end_with$q_28 = function($a_rest) {
      var self = this, suffixes;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      suffixes = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        suffixes[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      
      for (var i = 0, length = suffixes.length; i < length; i++) {
        var suffix = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(suffixes[i], Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();

        if (self.length >= suffix.length &&
            self.substr(self.length - suffix.length, suffix.length) == suffix) {
          return true;
        }
      }
    ;
      return false;
    }, TMP_String_end_with$q_28.$$arity = -1);
    Opal.alias(self, "eql?", "==");
    Opal.alias(self, "equal?", "===");
    Opal.defn(self, '$gsub', TMP_String_gsub_29 = function $$gsub(pattern, replacement) {
      var self = this, $iter = TMP_String_gsub_29.$$p, block = $iter || nil;

      TMP_String_gsub_29.$$p = null;
      
      if (replacement === undefined && block === nil) {
        return self.$enum_for("gsub", pattern);
      }

      var result = '', match_data = nil, index = 0, match, _replacement;

      if (pattern.$$is_regexp) {
        pattern = new RegExp(pattern.source, 'gm' + (pattern.ignoreCase ? 'i' : ''));
      } else {
        pattern = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(pattern, Opal.const_get($scopes, 'String', true, true), "to_str");
        pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
      }

      while (true) {
        match = pattern.exec(self);

        if (match === null) {
          ($gvars["~"] = nil)
          result += self.slice(index);
          break;
        }

        match_data = Opal.const_get($scopes, 'MatchData', true, true).$new(pattern, match);

        if (replacement === undefined) {
          _replacement = block(match[0]);
        }
        else if (replacement.$$is_hash) {
          _replacement = (replacement)['$[]'](match[0]).$to_s();
        }
        else {
          if (!replacement.$$is_string) {
            replacement = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(replacement, Opal.const_get($scopes, 'String', true, true), "to_str");
          }
          _replacement = replacement.replace(/([\\]+)([0-9+&`'])/g, function (original, slashes, command) {
            if (slashes.length % 2 === 0) {
              return original;
            }
            switch (command) {
            case "+":
              for (var i = match.length - 1; i > 0; i--) {
                if (match[i] !== undefined) {
                  return slashes.slice(1) + match[i];
                }
              }
              return '';
            case "&": return slashes.slice(1) + match[0];
            case "`": return slashes.slice(1) + self.slice(0, match.index);
            case "'": return slashes.slice(1) + self.slice(match.index + match[0].length);
            default:  return slashes.slice(1) + (match[command] || '');
            }
          }).replace(/\\\\/g, '\\');
        }

        if (pattern.lastIndex === match.index) {
          result += (_replacement + self.slice(index, match.index + 1))
          pattern.lastIndex += 1;
        }
        else {
          result += (self.slice(index, match.index) + _replacement)
        }
        index = pattern.lastIndex;
      }

      ($gvars["~"] = match_data)
      return result;
    
    }, TMP_String_gsub_29.$$arity = -2);
    Opal.defn(self, '$hash', TMP_String_hash_30 = function $$hash() {
      var self = this;

      return self.toString()
    }, TMP_String_hash_30.$$arity = 0);
    Opal.defn(self, '$hex', TMP_String_hex_31 = function $$hex() {
      var self = this;

      return self.$to_i(16)
    }, TMP_String_hex_31.$$arity = 0);
    Opal.defn(self, '$include?', TMP_String_include$q_32 = function(other) {
      var self = this;

      
      if (!other.$$is_string) {
        (other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'String', true, true), "to_str"))
      }
      return self.indexOf(other) !== -1;
    
    }, TMP_String_include$q_32.$$arity = 1);
    Opal.defn(self, '$index', TMP_String_index_33 = function $$index(search, offset) {
      var self = this;

      
      var index,
          match,
          regex;

      if (offset === undefined) {
        offset = 0;
      } else {
        offset = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(offset, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if (offset < 0) {
          offset += self.length;
          if (offset < 0) {
            return nil;
          }
        }
      }

      if (search.$$is_regexp) {
        regex = new RegExp(search.source, 'gm' + (search.ignoreCase ? 'i' : ''));
        while (true) {
          match = regex.exec(self);
          if (match === null) {
            ($gvars["~"] = nil);
            index = -1;
            break;
          }
          if (match.index >= offset) {
            ($gvars["~"] = Opal.const_get($scopes, 'MatchData', true, true).$new(regex, match))
            index = match.index;
            break;
          }
          regex.lastIndex = match.index + 1;
        }
      } else {
        search = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(search, Opal.const_get($scopes, 'String', true, true), "to_str");
        if (search.length === 0 && offset > self.length) {
          index = -1;
        } else {
          index = self.indexOf(search, offset);
        }
      }

      return index === -1 ? nil : index;
    
    }, TMP_String_index_33.$$arity = -2);
    Opal.defn(self, '$inspect', TMP_String_inspect_34 = function $$inspect() {
      var self = this;

      
      var escapable = /[\\\"\x00-\x1f\u007F-\u009F\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
          meta = {
            '\u0007': '\\a',
            '\u001b': '\\e',
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '\v': '\\v',
            '"' : '\\"',
            '\\': '\\\\'
          },
          escaped = self.replace(escapable, function (chr) {
            return meta[chr] || '\\u' + ('0000' + chr.charCodeAt(0).toString(16).toUpperCase()).slice(-4);
          });
      return '"' + escaped.replace(/\#[\$\@\{]/g, '\\$&') + '"';
    
    }, TMP_String_inspect_34.$$arity = 0);
    Opal.defn(self, '$intern', TMP_String_intern_35 = function $$intern() {
      var self = this;

      return self
    }, TMP_String_intern_35.$$arity = 0);
    Opal.defn(self, '$lines', TMP_String_lines_36 = function $$lines(separator) {
      var self = this, $iter = TMP_String_lines_36.$$p, block = $iter || nil, e = nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      TMP_String_lines_36.$$p = null;
      
      e = $send(self, 'each_line', [separator], block.$to_proc());
      if (block !== false && block !== nil && block != null) {
        return self
        } else {
        return e.$to_a()
      };
    }, TMP_String_lines_36.$$arity = -1);
    Opal.defn(self, '$length', TMP_String_length_37 = function $$length() {
      var self = this;

      return self.length
    }, TMP_String_length_37.$$arity = 0);
    Opal.defn(self, '$ljust', TMP_String_ljust_38 = function $$ljust(width, padstr) {
      var $a, self = this;

      if (padstr == null) {
        padstr = " ";
      }
      
      width = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(width, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      padstr = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(padstr, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
      if ((($a = padstr['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "zero width padding")};
      if ((($a = width <= self.length) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      var index  = -1,
          result = "";

      width -= self.length;

      while (++index < width) {
        result += padstr;
      }

      return self + result.slice(0, width);
    ;
    }, TMP_String_ljust_38.$$arity = -2);
    Opal.defn(self, '$lstrip', TMP_String_lstrip_39 = function $$lstrip() {
      var self = this;

      return self.replace(/^\s*/, '')
    }, TMP_String_lstrip_39.$$arity = 0);
    Opal.defn(self, '$ascii_only?', TMP_String_ascii_only$q_40 = function() {
      var self = this;

      return self.match(/[ -~\n]*/)[0] === self
    }, TMP_String_ascii_only$q_40.$$arity = 0);
    Opal.defn(self, '$match', TMP_String_match_41 = function $$match(pattern, pos) {
      var $a, $b, self = this, $iter = TMP_String_match_41.$$p, block = $iter || nil;

      TMP_String_match_41.$$p = null;
      
      if ((($a = ((($b = Opal.const_get($scopes, 'String', true, true)['$==='](pattern)) !== false && $b !== nil && $b != null) ? $b : pattern['$respond_to?']("to_str"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        pattern = Opal.const_get($scopes, 'Regexp', true, true).$new(pattern.$to_str())};
      if ((($a = Opal.const_get($scopes, 'Regexp', true, true)['$==='](pattern)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "wrong argument type " + (pattern.$class()) + " (expected Regexp)")
      };
      return $send(pattern, 'match', [self, pos], block.$to_proc());
    }, TMP_String_match_41.$$arity = -2);
    Opal.defn(self, '$next', TMP_String_next_42 = function $$next() {
      var self = this;

      
      var i = self.length;
      if (i === 0) {
        return '';
      }
      var result = self;
      var first_alphanum_char_index = self.search(/[a-zA-Z0-9]/);
      var carry = false;
      var code;
      while (i--) {
        code = self.charCodeAt(i);
        if ((code >= 48 && code <= 57) ||
          (code >= 65 && code <= 90) ||
          (code >= 97 && code <= 122)) {
          switch (code) {
          case 57:
            carry = true;
            code = 48;
            break;
          case 90:
            carry = true;
            code = 65;
            break;
          case 122:
            carry = true;
            code = 97;
            break;
          default:
            carry = false;
            code += 1;
          }
        } else {
          if (first_alphanum_char_index === -1) {
            if (code === 255) {
              carry = true;
              code = 0;
            } else {
              carry = false;
              code += 1;
            }
          } else {
            carry = true;
          }
        }
        result = result.slice(0, i) + String.fromCharCode(code) + result.slice(i + 1);
        if (carry && (i === 0 || i === first_alphanum_char_index)) {
          switch (code) {
          case 65:
            break;
          case 97:
            break;
          default:
            code += 1;
          }
          if (i === 0) {
            result = String.fromCharCode(code) + result;
          } else {
            result = result.slice(0, i) + String.fromCharCode(code) + result.slice(i);
          }
          carry = false;
        }
        if (!carry) {
          break;
        }
      }
      return result;
    
    }, TMP_String_next_42.$$arity = 0);
    Opal.defn(self, '$oct', TMP_String_oct_43 = function $$oct() {
      var self = this;

      
      var result,
          string = self,
          radix = 8;

      if (/^\s*_/.test(string)) {
        return 0;
      }

      string = string.replace(/^(\s*[+-]?)(0[bodx]?)(.+)$/i, function (original, head, flag, tail) {
        switch (tail.charAt(0)) {
        case '+':
        case '-':
          return original;
        case '0':
          if (tail.charAt(1) === 'x' && flag === '0x') {
            return original;
          }
        }
        switch (flag) {
        case '0b':
          radix = 2;
          break;
        case '0':
        case '0o':
          radix = 8;
          break;
        case '0d':
          radix = 10;
          break;
        case '0x':
          radix = 16;
          break;
        }
        return head + tail;
      });

      result = parseInt(string.replace(/_(?!_)/g, ''), radix);
      return isNaN(result) ? 0 : result;
    
    }, TMP_String_oct_43.$$arity = 0);
    Opal.defn(self, '$ord', TMP_String_ord_44 = function $$ord() {
      var self = this;

      return self.charCodeAt(0)
    }, TMP_String_ord_44.$$arity = 0);
    Opal.defn(self, '$partition', TMP_String_partition_45 = function $$partition(sep) {
      var self = this;

      
      var i, m;

      if (sep.$$is_regexp) {
        m = sep.exec(self);
        if (m === null) {
          i = -1;
        } else {
          Opal.const_get($scopes, 'MatchData', true, true).$new(sep, m);
          sep = m[0];
          i = m.index;
        }
      } else {
        sep = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(sep, Opal.const_get($scopes, 'String', true, true), "to_str");
        i = self.indexOf(sep);
      }

      if (i === -1) {
        return [self, '', ''];
      }

      return [
        self.slice(0, i),
        self.slice(i, i + sep.length),
        self.slice(i + sep.length)
      ];
    
    }, TMP_String_partition_45.$$arity = 1);
    Opal.defn(self, '$reverse', TMP_String_reverse_46 = function $$reverse() {
      var self = this;

      return self.split('').reverse().join('')
    }, TMP_String_reverse_46.$$arity = 0);
    Opal.defn(self, '$rindex', TMP_String_rindex_47 = function $$rindex(search, offset) {
      var self = this;

      
      var i, m, r, _m;

      if (offset === undefined) {
        offset = self.length;
      } else {
        offset = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(offset, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if (offset < 0) {
          offset += self.length;
          if (offset < 0) {
            return nil;
          }
        }
      }

      if (search.$$is_regexp) {
        m = null;
        r = new RegExp(search.source, 'gm' + (search.ignoreCase ? 'i' : ''));
        while (true) {
          _m = r.exec(self);
          if (_m === null || _m.index > offset) {
            break;
          }
          m = _m;
          r.lastIndex = m.index + 1;
        }
        if (m === null) {
          ($gvars["~"] = nil)
          i = -1;
        } else {
          Opal.const_get($scopes, 'MatchData', true, true).$new(r, m);
          i = m.index;
        }
      } else {
        search = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(search, Opal.const_get($scopes, 'String', true, true), "to_str");
        i = self.lastIndexOf(search, offset);
      }

      return i === -1 ? nil : i;
    
    }, TMP_String_rindex_47.$$arity = -2);
    Opal.defn(self, '$rjust', TMP_String_rjust_48 = function $$rjust(width, padstr) {
      var $a, self = this;

      if (padstr == null) {
        padstr = " ";
      }
      
      width = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(width, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      padstr = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(padstr, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
      if ((($a = padstr['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "zero width padding")};
      if ((($a = width <= self.length) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      var chars     = Math.floor(width - self.length),
          patterns  = Math.floor(chars / padstr.length),
          result    = Array(patterns + 1).join(padstr),
          remaining = chars - result.length;

      return result + padstr.slice(0, remaining) + self;
    ;
    }, TMP_String_rjust_48.$$arity = -2);
    Opal.defn(self, '$rpartition', TMP_String_rpartition_49 = function $$rpartition(sep) {
      var self = this;

      
      var i, m, r, _m;

      if (sep.$$is_regexp) {
        m = null;
        r = new RegExp(sep.source, 'gm' + (sep.ignoreCase ? 'i' : ''));

        while (true) {
          _m = r.exec(self);
          if (_m === null) {
            break;
          }
          m = _m;
          r.lastIndex = m.index + 1;
        }

        if (m === null) {
          i = -1;
        } else {
          Opal.const_get($scopes, 'MatchData', true, true).$new(r, m);
          sep = m[0];
          i = m.index;
        }

      } else {
        sep = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(sep, Opal.const_get($scopes, 'String', true, true), "to_str");
        i = self.lastIndexOf(sep);
      }

      if (i === -1) {
        return ['', '', self];
      }

      return [
        self.slice(0, i),
        self.slice(i, i + sep.length),
        self.slice(i + sep.length)
      ];
    
    }, TMP_String_rpartition_49.$$arity = 1);
    Opal.defn(self, '$rstrip', TMP_String_rstrip_50 = function $$rstrip() {
      var self = this;

      return self.replace(/[\s\u0000]*$/, '')
    }, TMP_String_rstrip_50.$$arity = 0);
    Opal.defn(self, '$scan', TMP_String_scan_51 = function $$scan(pattern) {
      var self = this, $iter = TMP_String_scan_51.$$p, block = $iter || nil;

      TMP_String_scan_51.$$p = null;
      
      var result = [],
          match_data = nil,
          match;

      if (pattern.$$is_regexp) {
        pattern = new RegExp(pattern.source, 'gm' + (pattern.ignoreCase ? 'i' : ''));
      } else {
        pattern = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(pattern, Opal.const_get($scopes, 'String', true, true), "to_str");
        pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
      }

      while ((match = pattern.exec(self)) != null) {
        match_data = Opal.const_get($scopes, 'MatchData', true, true).$new(pattern, match);
        if (block === nil) {
          match.length == 1 ? result.push(match[0]) : result.push((match_data).$captures());
        } else {
          match.length == 1 ? block(match[0]) : block.call(self, (match_data).$captures());
        }
        if (pattern.lastIndex === match.index) {
          pattern.lastIndex += 1;
        }
      }

      ($gvars["~"] = match_data)

      return (block !== nil ? self : result);
    
    }, TMP_String_scan_51.$$arity = 1);
    Opal.alias(self, "size", "length");
    Opal.alias(self, "slice", "[]");
    Opal.defn(self, '$split', TMP_String_split_52 = function $$split(pattern, limit) {
      var $a, self = this;
      if ($gvars[";"] == null) $gvars[";"] = nil;

      
      if (self.length === 0) {
        return [];
      }

      if (limit === undefined) {
        limit = 0;
      } else {
        limit = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](limit, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if (limit === 1) {
          return [self];
        }
      }

      if (pattern === undefined || pattern === nil) {
        pattern = ((($a = $gvars[";"]) !== false && $a !== nil && $a != null) ? $a : " ");
      }

      var result = [],
          string = self.toString(),
          index = 0,
          match,
          i;

      if (pattern.$$is_regexp) {
        pattern = new RegExp(pattern.source, 'gm' + (pattern.ignoreCase ? 'i' : ''));
      } else {
        pattern = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(pattern, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
        if (pattern === ' ') {
          pattern = /\s+/gm;
          string = string.replace(/^\s+/, '');
        } else {
          pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
        }
      }

      result = string.split(pattern);

      if (result.length === 1 && result[0] === string) {
        return result;
      }

      while ((i = result.indexOf(undefined)) !== -1) {
        result.splice(i, 1);
      }

      if (limit === 0) {
        while (result[result.length - 1] === '') {
          result.length -= 1;
        }
        return result;
      }

      match = pattern.exec(string);

      if (limit < 0) {
        if (match !== null && match[0] === '' && pattern.source.indexOf('(?=') === -1) {
          for (i = 0; i < match.length; i++) {
            result.push('');
          }
        }
        return result;
      }

      if (match !== null && match[0] === '') {
        result.splice(limit - 1, result.length - 1, result.slice(limit - 1).join(''));
        return result;
      }

      if (limit >= result.length) {
        return result;
      }

      i = 0;
      while (match !== null) {
        i++;
        index = pattern.lastIndex;
        if (i + 1 === limit) {
          break;
        }
        match = pattern.exec(string);
      }
      result.splice(limit - 1, result.length - 1, string.slice(index));
      return result;
    
    }, TMP_String_split_52.$$arity = -1);
    Opal.defn(self, '$squeeze', TMP_String_squeeze_53 = function $$squeeze($a_rest) {
      var self = this, sets;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      sets = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        sets[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (sets.length === 0) {
        return self.replace(/(.)\1+/g, '$1');
      }
      var char_class = char_class_from_char_sets(sets);
      if (char_class === null) {
        return self;
      }
      return self.replace(new RegExp('(' + char_class + ')\\1+', 'g'), '$1');
    
    }, TMP_String_squeeze_53.$$arity = -1);
    Opal.defn(self, '$start_with?', TMP_String_start_with$q_54 = function($a_rest) {
      var self = this, prefixes;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      prefixes = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        prefixes[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      for (var i = 0, length = prefixes.length; i < length; i++) {
        var prefix = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(prefixes[i], Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();

        if (self.indexOf(prefix) === 0) {
          return true;
        }
      }

      return false;
    
    }, TMP_String_start_with$q_54.$$arity = -1);
    Opal.defn(self, '$strip', TMP_String_strip_55 = function $$strip() {
      var self = this;

      return self.replace(/^\s*/, '').replace(/[\s\u0000]*$/, '')
    }, TMP_String_strip_55.$$arity = 0);
    Opal.defn(self, '$sub', TMP_String_sub_56 = function $$sub(pattern, replacement) {
      var self = this, $iter = TMP_String_sub_56.$$p, block = $iter || nil;

      TMP_String_sub_56.$$p = null;
      
      if (!pattern.$$is_regexp) {
        pattern = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(pattern, Opal.const_get($scopes, 'String', true, true), "to_str");
        pattern = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }

      var result = pattern.exec(self);

      if (result === null) {
        ($gvars["~"] = nil)
        return self.toString();
      }

      Opal.const_get($scopes, 'MatchData', true, true).$new(pattern, result)

      if (replacement === undefined) {
        if (block === nil) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "wrong number of arguments (1 for 2)")
        }
        return self.slice(0, result.index) + block(result[0]) + self.slice(result.index + result[0].length);
      }

      if (replacement.$$is_hash) {
        return self.slice(0, result.index) + (replacement)['$[]'](result[0]).$to_s() + self.slice(result.index + result[0].length);
      }

      replacement = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(replacement, Opal.const_get($scopes, 'String', true, true), "to_str");

      replacement = replacement.replace(/([\\]+)([0-9+&`'])/g, function (original, slashes, command) {
        if (slashes.length % 2 === 0) {
          return original;
        }
        switch (command) {
        case "+":
          for (var i = result.length - 1; i > 0; i--) {
            if (result[i] !== undefined) {
              return slashes.slice(1) + result[i];
            }
          }
          return '';
        case "&": return slashes.slice(1) + result[0];
        case "`": return slashes.slice(1) + self.slice(0, result.index);
        case "'": return slashes.slice(1) + self.slice(result.index + result[0].length);
        default:  return slashes.slice(1) + (result[command] || '');
        }
      }).replace(/\\\\/g, '\\');

      return self.slice(0, result.index) + replacement + self.slice(result.index + result[0].length);
    
    }, TMP_String_sub_56.$$arity = -2);
    Opal.alias(self, "succ", "next");
    Opal.defn(self, '$sum', TMP_String_sum_57 = function $$sum(n) {
      var self = this;

      if (n == null) {
        n = 16;
      }
      
      n = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(n, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      var result = 0,
          length = self.length,
          i = 0;

      for (; i < length; i++) {
        result += self.charCodeAt(i);
      }

      if (n <= 0) {
        return result;
      }

      return result & (Math.pow(2, n) - 1);
    
    }, TMP_String_sum_57.$$arity = -1);
    Opal.defn(self, '$swapcase', TMP_String_swapcase_58 = function $$swapcase() {
      var self = this;

      
      var str = self.replace(/([a-z]+)|([A-Z]+)/g, function($0,$1,$2) {
        return $1 ? $0.toUpperCase() : $0.toLowerCase();
      });

      if (self.constructor === String) {
        return str;
      }

      return self.$class().$new(str);
    
    }, TMP_String_swapcase_58.$$arity = 0);
    Opal.defn(self, '$to_f', TMP_String_to_f_59 = function $$to_f() {
      var self = this;

      
      if (self.charAt(0) === '_') {
        return 0;
      }

      var result = parseFloat(self.replace(/_/g, ''));

      if (isNaN(result) || result == Infinity || result == -Infinity) {
        return 0;
      }
      else {
        return result;
      }
    
    }, TMP_String_to_f_59.$$arity = 0);
    Opal.defn(self, '$to_i', TMP_String_to_i_60 = function $$to_i(base) {
      var self = this;

      if (base == null) {
        base = 10;
      }
      
      var result,
          string = self.toLowerCase(),
          radix = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(base, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      if (radix === 1 || radix < 0 || radix > 36) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid radix " + (radix))
      }

      if (/^\s*_/.test(string)) {
        return 0;
      }

      string = string.replace(/^(\s*[+-]?)(0[bodx]?)(.+)$/, function (original, head, flag, tail) {
        switch (tail.charAt(0)) {
        case '+':
        case '-':
          return original;
        case '0':
          if (tail.charAt(1) === 'x' && flag === '0x' && (radix === 0 || radix === 16)) {
            return original;
          }
        }
        switch (flag) {
        case '0b':
          if (radix === 0 || radix === 2) {
            radix = 2;
            return head + tail;
          }
          break;
        case '0':
        case '0o':
          if (radix === 0 || radix === 8) {
            radix = 8;
            return head + tail;
          }
          break;
        case '0d':
          if (radix === 0 || radix === 10) {
            radix = 10;
            return head + tail;
          }
          break;
        case '0x':
          if (radix === 0 || radix === 16) {
            radix = 16;
            return head + tail;
          }
          break;
        }
        return original
      });

      result = parseInt(string.replace(/_(?!_)/g, ''), radix);
      return isNaN(result) ? 0 : result;
    
    }, TMP_String_to_i_60.$$arity = -1);
    Opal.defn(self, '$to_proc', TMP_String_to_proc_62 = function $$to_proc() {
      var TMP_61, self = this, sym = nil;

      
      sym = self;
      return $send(self, 'proc', [], (TMP_61 = function($a_rest){var self = TMP_61.$$s || this, block, args, $b, obj = nil;

        block = TMP_61.$$p || nil, TMP_61.$$p = null;
        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      
        if ((($b = args['$empty?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "no receiver given")};
        obj = args.$shift();
        return $send(obj, '__send__', [sym].concat(Opal.to_a(args)), block.$to_proc());}, TMP_61.$$s = self, TMP_61.$$arity = -1, TMP_61));
    }, TMP_String_to_proc_62.$$arity = 0);
    Opal.defn(self, '$to_s', TMP_String_to_s_63 = function $$to_s() {
      var self = this;

      return self.toString()
    }, TMP_String_to_s_63.$$arity = 0);
    Opal.alias(self, "to_str", "to_s");
    Opal.alias(self, "to_sym", "intern");
    Opal.defn(self, '$tr', TMP_String_tr_64 = function $$tr(from, to) {
      var self = this;

      
      from = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(from, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
      to = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(to, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
      
      if (from.length == 0 || from === to) {
        return self;
      }

      var i, in_range, c, ch, start, end, length;
      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^' && from_chars.length > 1) {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      in_range = false;
      for (i = 0; i < from_length; i++) {
        ch = from_chars[i];
        if (last_from == null) {
          last_from = ch;
          from_chars_expanded.push(ch);
        }
        else if (ch === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          start = last_from.charCodeAt(0);
          end = ch.charCodeAt(0);
          if (start > end) {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
          }
          for (c = start + 1; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(ch);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(ch);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          in_range = false;
          for (i = 0; i < to_length; i++) {
            ch = to_chars[i];
            if (last_to == null) {
              last_to = ch;
              to_chars_expanded.push(ch);
            }
            else if (ch === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              start = last_to.charCodeAt(0);
              end = ch.charCodeAt(0);
              if (start > end) {
                self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
              }
              for (c = start + 1; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(ch);
              in_range = null;
              last_to = null;
            }
            else {
              to_chars_expanded.push(ch);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }

        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }

      var new_str = ''
      for (i = 0, length = self.length; i < length; i++) {
        ch = self.charAt(i);
        var sub = subs[ch];
        if (inverse) {
          new_str += (sub == null ? global_sub : ch);
        }
        else {
          new_str += (sub != null ? sub : ch);
        }
      }
      return new_str;
    ;
    }, TMP_String_tr_64.$$arity = 2);
    Opal.defn(self, '$tr_s', TMP_String_tr_s_65 = function $$tr_s(from, to) {
      var self = this;

      
      from = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(from, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
      to = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(to, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s();
      
      if (from.length == 0) {
        return self;
      }

      var i, in_range, c, ch, start, end, length;
      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^' && from_chars.length > 1) {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      in_range = false;
      for (i = 0; i < from_length; i++) {
        ch = from_chars[i];
        if (last_from == null) {
          last_from = ch;
          from_chars_expanded.push(ch);
        }
        else if (ch === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          start = last_from.charCodeAt(0);
          end = ch.charCodeAt(0);
          if (start > end) {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
          }
          for (c = start + 1; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(ch);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(ch);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          in_range = false;
          for (i = 0; i < to_length; i++) {
            ch = to_chars[i];
            if (last_from == null) {
              last_from = ch;
              to_chars_expanded.push(ch);
            }
            else if (ch === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              start = last_from.charCodeAt(0);
              end = ch.charCodeAt(0);
              if (start > end) {
                self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid range \"" + (String.fromCharCode(start)) + "-" + (String.fromCharCode(end)) + "\" in string transliteration")
              }
              for (c = start + 1; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(ch);
              in_range = null;
              last_from = null;
            }
            else {
              to_chars_expanded.push(ch);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }

        for (i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }
      var new_str = ''
      var last_substitute = null
      for (i = 0, length = self.length; i < length; i++) {
        ch = self.charAt(i);
        var sub = subs[ch]
        if (inverse) {
          if (sub == null) {
            if (last_substitute == null) {
              new_str += global_sub;
              last_substitute = true;
            }
          }
          else {
            new_str += ch;
            last_substitute = null;
          }
        }
        else {
          if (sub != null) {
            if (last_substitute == null || last_substitute !== sub) {
              new_str += sub;
              last_substitute = sub;
            }
          }
          else {
            new_str += ch;
            last_substitute = null;
          }
        }
      }
      return new_str;
    ;
    }, TMP_String_tr_s_65.$$arity = 2);
    Opal.defn(self, '$upcase', TMP_String_upcase_66 = function $$upcase() {
      var self = this;

      return self.toUpperCase()
    }, TMP_String_upcase_66.$$arity = 0);
    Opal.defn(self, '$upto', TMP_String_upto_67 = function $$upto(stop, excl) {
      var self = this, $iter = TMP_String_upto_67.$$p, block = $iter || nil;

      if (excl == null) {
        excl = false;
      }
      TMP_String_upto_67.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return self.$enum_for("upto", stop, excl)
      };
      stop = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(stop, Opal.const_get($scopes, 'String', true, true), "to_str");
      
      var a, b, s = self.toString();

      if (s.length === 1 && stop.length === 1) {

        a = s.charCodeAt(0);
        b = stop.charCodeAt(0);

        while (a <= b) {
          if (excl && a === b) {
            break;
          }

          block(String.fromCharCode(a));

          a += 1;
        }

      } else if (parseInt(s, 10).toString() === s && parseInt(stop, 10).toString() === stop) {

        a = parseInt(s, 10);
        b = parseInt(stop, 10);

        while (a <= b) {
          if (excl && a === b) {
            break;
          }

          block(a.toString());

          a += 1;
        }

      } else {

        while (s.length <= stop.length && s <= stop) {
          if (excl && s === stop) {
            break;
          }

          block(s);

          s = (s).$succ();
        }

      }
      return self;
    ;
    }, TMP_String_upto_67.$$arity = -2);
    
    function char_class_from_char_sets(sets) {
      function explode_sequences_in_character_set(set) {
        var result = '',
            i, len = set.length,
            curr_char,
            skip_next_dash,
            char_code_from,
            char_code_upto,
            char_code;
        for (i = 0; i < len; i++) {
          curr_char = set.charAt(i);
          if (curr_char === '-' && i > 0 && i < (len - 1) && !skip_next_dash) {
            char_code_from = set.charCodeAt(i - 1);
            char_code_upto = set.charCodeAt(i + 1);
            if (char_code_from > char_code_upto) {
              self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid range \"" + (char_code_from) + "-" + (char_code_upto) + "\" in string transliteration")
            }
            for (char_code = char_code_from + 1; char_code < char_code_upto + 1; char_code++) {
              result += String.fromCharCode(char_code);
            }
            skip_next_dash = true;
            i++;
          } else {
            skip_next_dash = (curr_char === '\\');
            result += curr_char;
          }
        }
        return result;
      }

      function intersection(setA, setB) {
        if (setA.length === 0) {
          return setB;
        }
        var result = '',
            i, len = setA.length,
            chr;
        for (i = 0; i < len; i++) {
          chr = setA.charAt(i);
          if (setB.indexOf(chr) !== -1) {
            result += chr;
          }
        }
        return result;
      }

      var i, len, set, neg, chr, tmp,
          pos_intersection = '',
          neg_intersection = '';

      for (i = 0, len = sets.length; i < len; i++) {
        set = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(sets[i], Opal.const_get($scopes, 'String', true, true), "to_str");
        neg = (set.charAt(0) === '^' && set.length > 1);
        set = explode_sequences_in_character_set(neg ? set.slice(1) : set);
        if (neg) {
          neg_intersection = intersection(neg_intersection, set);
        } else {
          pos_intersection = intersection(pos_intersection, set);
        }
      }

      if (pos_intersection.length > 0 && neg_intersection.length > 0) {
        tmp = '';
        for (i = 0, len = pos_intersection.length; i < len; i++) {
          chr = pos_intersection.charAt(i);
          if (neg_intersection.indexOf(chr) === -1) {
            tmp += chr;
          }
        }
        pos_intersection = tmp;
        neg_intersection = '';
      }

      if (pos_intersection.length > 0) {
        return '[' + Opal.const_get($scopes, 'Regexp', true, true).$escape(pos_intersection) + ']';
      }

      if (neg_intersection.length > 0) {
        return '[^' + Opal.const_get($scopes, 'Regexp', true, true).$escape(neg_intersection) + ']';
      }

      return null;
    }
  ;
    Opal.defn(self, '$instance_variables', TMP_String_instance_variables_68 = function $$instance_variables() {
      var self = this;

      return []
    }, TMP_String_instance_variables_68.$$arity = 0);
    Opal.defs(self, '$_load', TMP_String__load_69 = function $$_load($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      return $send(self, 'new', Opal.to_a(args))
    }, TMP_String__load_69.$$arity = -1);
    return (Opal.defn(self, '$unpack', TMP_String_unpack_70 = function $$unpack(pattern) {
      var self = this, $case = nil;

      
      
      function stringToBytes(string) {
        var i,
            singleByte,
            l = string.length,
            result = [];

        for (i = 0; i < l; i++) {
          singleByte = string.charCodeAt(i);
          result.push(singleByte);
        }
        return result;
      }
    ;
      return (function() {$case = pattern;
if ("U*"['$===']($case) || "C*"['$===']($case)) {return stringToBytes(self);}else {return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true))}})();
    }, TMP_String_unpack_70.$$arity = 1), nil) && 'unpack';
  })($scope.base, String, $scopes);
  return Opal.cdecl($scope, 'Symbol', Opal.const_get($scopes, 'String', true, true));
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/enumerable"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module, $send = Opal.send;

  Opal.add_stubs(['$each', '$destructure', '$raise', '$new', '$yield', '$slice_when', '$!', '$enum_for', '$enumerator_size', '$flatten', '$map', '$proc', '$==', '$nil?', '$respond_to?', '$coerce_to!', '$>', '$*', '$coerce_to', '$try_convert', '$<', '$+', '$-', '$to_enum', '$ceil', '$/', '$size', '$===', '$<<', '$[]', '$[]=', '$inspect', '$__send__', '$<=>', '$first', '$reverse', '$sort', '$to_proc', '$compare', '$call', '$dup', '$to_a', '$lambda', '$sort!', '$map!', '$zip']);
  return (function($base, $visibility_scopes) {
    var $Enumerable, self = $Enumerable = $module($base, 'Enumerable');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Enumerable_all$q_1, TMP_Enumerable_any$q_4, TMP_Enumerable_chunk_7, TMP_Enumerable_chunk_while_9, TMP_Enumerable_collect_11, TMP_Enumerable_collect_concat_13, TMP_Enumerable_count_16, TMP_Enumerable_cycle_20, TMP_Enumerable_detect_22, TMP_Enumerable_drop_24, TMP_Enumerable_drop_while_25, TMP_Enumerable_each_cons_26, TMP_Enumerable_each_entry_28, TMP_Enumerable_each_slice_30, TMP_Enumerable_each_with_index_32, TMP_Enumerable_each_with_object_34, TMP_Enumerable_entries_36, TMP_Enumerable_find_all_37, TMP_Enumerable_find_index_39, TMP_Enumerable_first_44, TMP_Enumerable_grep_45, TMP_Enumerable_grep_v_46, TMP_Enumerable_group_by_47, TMP_Enumerable_include$q_50, TMP_Enumerable_inject_51, TMP_Enumerable_lazy_53, TMP_Enumerable_enumerator_size_54, TMP_Enumerable_max_55, TMP_Enumerable_max_by_56, TMP_Enumerable_min_58, TMP_Enumerable_min_by_59, TMP_Enumerable_minmax_61, TMP_Enumerable_minmax_by_63, TMP_Enumerable_none$q_64, TMP_Enumerable_one$q_67, TMP_Enumerable_partition_70, TMP_Enumerable_reject_72, TMP_Enumerable_reverse_each_74, TMP_Enumerable_slice_before_76, TMP_Enumerable_slice_after_78, TMP_Enumerable_slice_when_81, TMP_Enumerable_sort_83, TMP_Enumerable_sort_by_85, TMP_Enumerable_take_90, TMP_Enumerable_take_while_91, TMP_Enumerable_zip_93;

    
    Opal.defn(self, '$all?', TMP_Enumerable_all$q_1 = function() {try {

      var TMP_2, TMP_3, self = this, $iter = TMP_Enumerable_all$q_1.$$p, block = $iter || nil;

      TMP_Enumerable_all$q_1.$$p = null;
      
      if ((block !== nil)) {
        $send(self, 'each', [], (TMP_2 = function($a_rest){var self = TMP_2.$$s || this, value, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($b = Opal.yieldX(block, Opal.to_a(value))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            return nil
            } else {
            Opal.ret(false)
          }}, TMP_2.$$s = self, TMP_2.$$arity = -1, TMP_2))
        } else {
        $send(self, 'each', [], (TMP_3 = function($a_rest){var self = TMP_3.$$s || this, value, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($b = Opal.const_get($scopes, 'Opal', true, true).$destructure(value)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            return nil
            } else {
            Opal.ret(false)
          }}, TMP_3.$$s = self, TMP_3.$$arity = -1, TMP_3))
      };
      return true;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Enumerable_all$q_1.$$arity = 0);
    Opal.defn(self, '$any?', TMP_Enumerable_any$q_4 = function() {try {

      var TMP_5, TMP_6, self = this, $iter = TMP_Enumerable_any$q_4.$$p, block = $iter || nil;

      TMP_Enumerable_any$q_4.$$p = null;
      
      if ((block !== nil)) {
        $send(self, 'each', [], (TMP_5 = function($a_rest){var self = TMP_5.$$s || this, value, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($b = Opal.yieldX(block, Opal.to_a(value))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            Opal.ret(true)
            } else {
            return nil
          }}, TMP_5.$$s = self, TMP_5.$$arity = -1, TMP_5))
        } else {
        $send(self, 'each', [], (TMP_6 = function($a_rest){var self = TMP_6.$$s || this, value, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($b = Opal.const_get($scopes, 'Opal', true, true).$destructure(value)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            Opal.ret(true)
            } else {
            return nil
          }}, TMP_6.$$s = self, TMP_6.$$arity = -1, TMP_6))
      };
      return false;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Enumerable_any$q_4.$$arity = 0);
    Opal.defn(self, '$chunk', TMP_Enumerable_chunk_7 = function $$chunk() {
      var TMP_8, self = this, $iter = TMP_Enumerable_chunk_7.$$p, block = $iter || nil;

      TMP_Enumerable_chunk_7.$$p = null;
      
      if ((block !== nil)) {
        } else {
        Opal.const_get($scopes, 'Kernel', true, true).$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "no block given")
      };
      return $send(Opal.const_get([Opal.Object.$$scope], 'Enumerator', true, true), 'new', [], (TMP_8 = function(yielder){var self = TMP_8.$$s || this;
if (yielder == null) yielder = nil;
      
        var previous = nil, accumulate = [];

        function releaseAccumulate() {
          if (accumulate.length > 0) {
            yielder.$yield(previous, accumulate)
          }
        }

        self.$each.$$p = function(value) {
          var key = Opal.yield1(block, value);

          if (key === nil) {
            releaseAccumulate();
            accumulate = [];
            previous = nil;
          } else {
            if (previous === nil || previous === key) {
              accumulate.push(value);
            } else {
              releaseAccumulate();
              accumulate = [value];
            }

            previous = key;
          }
        }

        self.$each();

        releaseAccumulate();
      }, TMP_8.$$s = self, TMP_8.$$arity = 1, TMP_8));
    }, TMP_Enumerable_chunk_7.$$arity = 0);
    Opal.defn(self, '$chunk_while', TMP_Enumerable_chunk_while_9 = function $$chunk_while() {
      var TMP_10, self = this, $iter = TMP_Enumerable_chunk_while_9.$$p, block = $iter || nil;

      TMP_Enumerable_chunk_while_9.$$p = null;
      
      if ((block !== nil)) {
        } else {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "no block given")
      };
      return $send(self, 'slice_when', [], (TMP_10 = function(before, after){var self = TMP_10.$$s || this;
if (before == null) before = nil;if (after == null) after = nil;
      return Opal.yieldX(block, [before, after])['$!']()}, TMP_10.$$s = self, TMP_10.$$arity = 2, TMP_10));
    }, TMP_Enumerable_chunk_while_9.$$arity = 0);
    Opal.defn(self, '$collect', TMP_Enumerable_collect_11 = function $$collect() {
      var TMP_12, self = this, $iter = TMP_Enumerable_collect_11.$$p, block = $iter || nil;

      TMP_Enumerable_collect_11.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["collect"], (TMP_12 = function(){var self = TMP_12.$$s || this;

        return self.$enumerator_size()}, TMP_12.$$s = self, TMP_12.$$arity = 0, TMP_12))
      };
      
      var result = [];

      self.$each.$$p = function() {
        var value = Opal.yieldX(block, arguments);

        result.push(value);
      };

      self.$each();

      return result;
    ;
    }, TMP_Enumerable_collect_11.$$arity = 0);
    Opal.defn(self, '$collect_concat', TMP_Enumerable_collect_concat_13 = function $$collect_concat() {
      var TMP_14, TMP_15, self = this, $iter = TMP_Enumerable_collect_concat_13.$$p, block = $iter || nil;

      TMP_Enumerable_collect_concat_13.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["collect_concat"], (TMP_14 = function(){var self = TMP_14.$$s || this;

        return self.$enumerator_size()}, TMP_14.$$s = self, TMP_14.$$arity = 0, TMP_14))
      };
      return $send(self, 'map', [], (TMP_15 = function(item){var self = TMP_15.$$s || this;
if (item == null) item = nil;
      return Opal.yield1(block, item);}, TMP_15.$$s = self, TMP_15.$$arity = 1, TMP_15)).$flatten(1);
    }, TMP_Enumerable_collect_concat_13.$$arity = 0);
    Opal.defn(self, '$count', TMP_Enumerable_count_16 = function $$count(object) {
      var $a, TMP_17, TMP_18, TMP_19, self = this, $iter = TMP_Enumerable_count_16.$$p, block = $iter || nil, result = nil;

      TMP_Enumerable_count_16.$$p = null;
      
      result = 0;
      if ((($a = object != null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        block = $send(self, 'proc', [], (TMP_17 = function($b_rest){var self = TMP_17.$$s || this, args;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 0] = arguments[$arg_idx];
          }
        return Opal.const_get($scopes, 'Opal', true, true).$destructure(args)['$=='](object)}, TMP_17.$$s = self, TMP_17.$$arity = -1, TMP_17))
      } else if ((($a = block['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        block = $send(self, 'proc', [], (TMP_18 = function(){var self = TMP_18.$$s || this;

        return true}, TMP_18.$$s = self, TMP_18.$$arity = 0, TMP_18))};
      $send(self, 'each', [], (TMP_19 = function($b_rest){var self = TMP_19.$$s || this, args, $c;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      if ((($c = Opal.yieldX(block, args)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          return result++
          } else {
          return nil
        }}, TMP_19.$$s = self, TMP_19.$$arity = -1, TMP_19));
      return result;
    }, TMP_Enumerable_count_16.$$arity = -1);
    Opal.defn(self, '$cycle', TMP_Enumerable_cycle_20 = function $$cycle(n) {
      var TMP_21, $a, self = this, $iter = TMP_Enumerable_cycle_20.$$p, block = $iter || nil;

      if (n == null) {
        n = nil;
      }
      TMP_Enumerable_cycle_20.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["cycle", n], (TMP_21 = function(){var self = TMP_21.$$s || this, $a;

        if (n['$=='](nil)) {
            if ((($a = self['$respond_to?']("size")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
              return Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'INFINITY', true, true)
              } else {
              return nil
            }
            } else {
            
            n = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
            if ((($a = $rb_gt(n, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
              return $rb_times(self.$enumerator_size(), n)
              } else {
              return 0
            };
          }}, TMP_21.$$s = self, TMP_21.$$arity = 0, TMP_21))
      };
      if ((($a = n['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        
        n = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($a = n <= 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil};
      };
      
      var result,
          all = [], i, length, value;

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
            value = Opal.yield1(block, param);

        all.push(param);
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }

      if (all.length === 0) {
        return nil;
      }

      if (n === nil) {
        while (true) {
          for (i = 0, length = all.length; i < length; i++) {
            value = Opal.yield1(block, all[i]);
          }
        }
      }
      else {
        while (n > 1) {
          for (i = 0, length = all.length; i < length; i++) {
            value = Opal.yield1(block, all[i]);
          }

          n--;
        }
      }
    ;
    }, TMP_Enumerable_cycle_20.$$arity = -1);
    Opal.defn(self, '$detect', TMP_Enumerable_detect_22 = function $$detect(ifnone) {try {

      var TMP_23, self = this, $iter = TMP_Enumerable_detect_22.$$p, block = $iter || nil;

      TMP_Enumerable_detect_22.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return self.$enum_for("detect", ifnone)
      };
      $send(self, 'each', [], (TMP_23 = function($a_rest){var self = TMP_23.$$s || this, args, $b, value = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      
        value = Opal.const_get($scopes, 'Opal', true, true).$destructure(args);
        if ((($b = Opal.yield1(block, value)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          Opal.ret(value)
          } else {
          return nil
        };}, TMP_23.$$s = self, TMP_23.$$arity = -1, TMP_23));
      
      if (ifnone !== undefined) {
        if (typeof(ifnone) === 'function') {
          return ifnone();
        } else {
          return ifnone;
        }
      }
    ;
      return nil;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Enumerable_detect_22.$$arity = -1);
    Opal.defn(self, '$drop', TMP_Enumerable_drop_24 = function $$drop(number) {
      var $a, self = this;

      
      number = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(number, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      if ((($a = number < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "attempt to drop negative size")};
      
      var result  = [],
          current = 0;

      self.$each.$$p = function() {
        if (number <= current) {
          result.push(Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments));
        }

        current++;
      };

      self.$each()

      return result;
    ;
    }, TMP_Enumerable_drop_24.$$arity = 1);
    Opal.defn(self, '$drop_while', TMP_Enumerable_drop_while_25 = function $$drop_while() {
      var $a, self = this, $iter = TMP_Enumerable_drop_while_25.$$p, block = $iter || nil;

      TMP_Enumerable_drop_while_25.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return self.$enum_for("drop_while")
      };
      
      var result   = [],
          dropping = true;

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

        if (dropping) {
          var value = Opal.yield1(block, param);

          if ((($a = value) === nil || $a == null || ($a.$$is_boolean && $a == false))) {
            dropping = false;
            result.push(param);
          }
        }
        else {
          result.push(param);
        }
      };

      self.$each();

      return result;
    ;
    }, TMP_Enumerable_drop_while_25.$$arity = 0);
    Opal.defn(self, '$each_cons', TMP_Enumerable_each_cons_26 = function $$each_cons(n) {
      var $a, TMP_27, self = this, $iter = TMP_Enumerable_each_cons_26.$$p, block = $iter || nil;

      TMP_Enumerable_each_cons_26.$$p = null;
      
      if ((($a = arguments.length != 1) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (arguments.length) + " for 1)")};
      n = Opal.const_get($scopes, 'Opal', true, true).$try_convert(n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      if ((($a = n <= 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "invalid size")};
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["each_cons", n], (TMP_27 = function(){var self = TMP_27.$$s || this, $b, $c, enum_size = nil;

        
          enum_size = self.$enumerator_size();
          if ((($b = enum_size['$nil?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            return nil
          } else if ((($b = ((($c = enum_size['$=='](0)) !== false && $c !== nil && $c != null) ? $c : $rb_lt(enum_size, n))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            return 0
            } else {
            return $rb_plus($rb_minus(enum_size, n), 1)
          };}, TMP_27.$$s = self, TMP_27.$$arity = 0, TMP_27))
      };
      
      var buffer = [], result = nil;

      self.$each.$$p = function() {
        var element = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);
        buffer.push(element);
        if (buffer.length > n) {
          buffer.shift();
        }
        if (buffer.length == n) {
          Opal.yield1(block, buffer.slice(0, n));
        }
      }

      self.$each();

      return result;
    ;
    }, TMP_Enumerable_each_cons_26.$$arity = 1);
    Opal.defn(self, '$each_entry', TMP_Enumerable_each_entry_28 = function $$each_entry($a_rest) {
      var TMP_29, self = this, data, $iter = TMP_Enumerable_each_entry_28.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      data = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        data[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Enumerable_each_entry_28.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'to_enum', ["each_entry"].concat(Opal.to_a(data)), (TMP_29 = function(){var self = TMP_29.$$s || this;

        return self.$enumerator_size()}, TMP_29.$$s = self, TMP_29.$$arity = 0, TMP_29))
      };
      
      self.$each.$$p = function() {
        var item = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

        Opal.yield1(block, item);
      }

      self.$each.apply(self, data);

      return self;
    ;
    }, TMP_Enumerable_each_entry_28.$$arity = -1);
    Opal.defn(self, '$each_slice', TMP_Enumerable_each_slice_30 = function $$each_slice(n) {
      var $a, TMP_31, self = this, $iter = TMP_Enumerable_each_slice_30.$$p, block = $iter || nil;

      TMP_Enumerable_each_slice_30.$$p = null;
      
      n = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      if ((($a = n <= 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "invalid slice size")};
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["each_slice", n], (TMP_31 = function(){var self = TMP_31.$$s || this, $b;

        if ((($b = self['$respond_to?']("size")) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            return $rb_divide(self.$size(), n).$ceil()
            } else {
            return nil
          }}, TMP_31.$$s = self, TMP_31.$$arity = 0, TMP_31))
      };
      
      var result,
          slice = []

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

        slice.push(param);

        if (slice.length === n) {
          Opal.yield1(block, slice);
          slice = [];
        }
      };

      self.$each();

      if (result !== undefined) {
        return result;
      }

      // our "last" group, if smaller than n then won't have been yielded
      if (slice.length > 0) {
        Opal.yield1(block, slice);
      }
    ;
      return nil;
    }, TMP_Enumerable_each_slice_30.$$arity = 1);
    Opal.defn(self, '$each_with_index', TMP_Enumerable_each_with_index_32 = function $$each_with_index($a_rest) {
      var TMP_33, self = this, args, $iter = TMP_Enumerable_each_with_index_32.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Enumerable_each_with_index_32.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["each_with_index"].concat(Opal.to_a(args)), (TMP_33 = function(){var self = TMP_33.$$s || this;

        return self.$enumerator_size()}, TMP_33.$$s = self, TMP_33.$$arity = 0, TMP_33))
      };
      
      var result,
          index = 0;

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

        block(param, index);

        index++;
      };

      self.$each.apply(self, args);

      if (result !== undefined) {
        return result;
      }
    ;
      return self;
    }, TMP_Enumerable_each_with_index_32.$$arity = -1);
    Opal.defn(self, '$each_with_object', TMP_Enumerable_each_with_object_34 = function $$each_with_object(object) {
      var TMP_35, self = this, $iter = TMP_Enumerable_each_with_object_34.$$p, block = $iter || nil;

      TMP_Enumerable_each_with_object_34.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["each_with_object", object], (TMP_35 = function(){var self = TMP_35.$$s || this;

        return self.$enumerator_size()}, TMP_35.$$s = self, TMP_35.$$arity = 0, TMP_35))
      };
      
      var result;

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

        block(param, object);
      };

      self.$each();

      if (result !== undefined) {
        return result;
      }
    ;
      return object;
    }, TMP_Enumerable_each_with_object_34.$$arity = 1);
    Opal.defn(self, '$entries', TMP_Enumerable_entries_36 = function $$entries($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var result = [];

      self.$each.$$p = function() {
        result.push(Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments));
      };

      self.$each.apply(self, args);

      return result;
    
    }, TMP_Enumerable_entries_36.$$arity = -1);
    Opal.alias(self, "find", "detect");
    Opal.defn(self, '$find_all', TMP_Enumerable_find_all_37 = function $$find_all() {
      var TMP_38, $a, self = this, $iter = TMP_Enumerable_find_all_37.$$p, block = $iter || nil;

      TMP_Enumerable_find_all_37.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["find_all"], (TMP_38 = function(){var self = TMP_38.$$s || this;

        return self.$enumerator_size()}, TMP_38.$$s = self, TMP_38.$$arity = 0, TMP_38))
      };
      
      var result = [];

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
            value = Opal.yield1(block, param);

        if ((($a = value) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          result.push(param);
        }
      };

      self.$each();

      return result;
    ;
    }, TMP_Enumerable_find_all_37.$$arity = 0);
    Opal.defn(self, '$find_index', TMP_Enumerable_find_index_39 = function $$find_index(object) {try {

      var $a, TMP_40, TMP_41, self = this, $iter = TMP_Enumerable_find_index_39.$$p, block = $iter || nil, index = nil;

      TMP_Enumerable_find_index_39.$$p = null;
      
      if ((($a = object === undefined && block === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$enum_for("find_index")};
      index = 0;
      if ((($a = object != null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        $send(self, 'each', [], (TMP_40 = function($b_rest){var self = TMP_40.$$s || this, value;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        
          if (Opal.const_get($scopes, 'Opal', true, true).$destructure(value)['$=='](object)) {
            Opal.ret(index)};
          return index += 1;}, TMP_40.$$s = self, TMP_40.$$arity = -1, TMP_40))
        } else {
        $send(self, 'each', [], (TMP_41 = function($b_rest){var self = TMP_41.$$s || this, value, $c;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        
          if ((($c = Opal.yieldX(block, Opal.to_a(value))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            Opal.ret(index)};
          return index += 1;}, TMP_41.$$s = self, TMP_41.$$arity = -1, TMP_41))
      };
      return nil;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Enumerable_find_index_39.$$arity = -1);
    Opal.defn(self, '$first', TMP_Enumerable_first_44 = function $$first(number) {try {

      var $a, TMP_42, TMP_43, self = this, result = nil, current = nil;

      if ((($a = number === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $send(self, 'each', [], (TMP_42 = function(value){var self = TMP_42.$$s || this;
if (value == null) value = nil;
        Opal.ret(value)}, TMP_42.$$s = self, TMP_42.$$arity = 1, TMP_42))
        } else {
        
        result = [];
        number = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(number, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($a = number < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "attempt to take negative size")};
        if ((($a = number == 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return []};
        current = 0;
        $send(self, 'each', [], (TMP_43 = function($b_rest){var self = TMP_43.$$s || this, args, $c;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 0] = arguments[$arg_idx];
          }
        
          result.push(Opal.const_get($scopes, 'Opal', true, true).$destructure(args));
          if ((($c = number <= ++current) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            Opal.ret(result)
            } else {
            return nil
          };}, TMP_43.$$s = self, TMP_43.$$arity = -1, TMP_43));
        return result;
      }
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Enumerable_first_44.$$arity = -1);
    Opal.alias(self, "flat_map", "collect_concat");
    Opal.defn(self, '$grep', TMP_Enumerable_grep_45 = function $$grep(pattern) {
      var $a, self = this, $iter = TMP_Enumerable_grep_45.$$p, block = $iter || nil;

      TMP_Enumerable_grep_45.$$p = null;
      
      var result = [];

      if (block !== nil) {
        self.$each.$$p = function() {
          var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
              value = pattern['$==='](param);

          if ((($a = value) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            value = Opal.yield1(block, param);

            result.push(value);
          }
        };
      }
      else {
        self.$each.$$p = function() {
          var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
              value = pattern['$==='](param);

          if ((($a = value) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            result.push(param);
          }
        };
      }

      self.$each();

      return result;
    
    }, TMP_Enumerable_grep_45.$$arity = 1);
    Opal.defn(self, '$grep_v', TMP_Enumerable_grep_v_46 = function $$grep_v(pattern) {
      var $a, self = this, $iter = TMP_Enumerable_grep_v_46.$$p, block = $iter || nil;

      TMP_Enumerable_grep_v_46.$$p = null;
      
      var result = [];

      if (block !== nil) {
        self.$each.$$p = function() {
          var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
              value = pattern['$==='](param);

          if ((($a = value) === nil || $a == null || ($a.$$is_boolean && $a == false))) {
            value = Opal.yield1(block, param);

            result.push(value);
          }
        };
      }
      else {
        self.$each.$$p = function() {
          var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
              value = pattern['$==='](param);

          if ((($a = value) === nil || $a == null || ($a.$$is_boolean && $a == false))) {
            result.push(param);
          }
        };
      }

      self.$each();

      return result;
    
    }, TMP_Enumerable_grep_v_46.$$arity = 1);
    Opal.defn(self, '$group_by', TMP_Enumerable_group_by_47 = function $$group_by() {
      var TMP_48, $a, $b, $c, self = this, $iter = TMP_Enumerable_group_by_47.$$p, block = $iter || nil, hash = nil;

      TMP_Enumerable_group_by_47.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["group_by"], (TMP_48 = function(){var self = TMP_48.$$s || this;

        return self.$enumerator_size()}, TMP_48.$$s = self, TMP_48.$$arity = 0, TMP_48))
      };
      hash = Opal.const_get($scopes, 'Hash', true, true).$new();
      
      var result;

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
            value = Opal.yield1(block, param);

        ($a = value, $b = hash, ((($c = $b['$[]']($a)) !== false && $c !== nil && $c != null) ? $c : $b['$[]=']($a, [])))['$<<'](param);
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }
    ;
      return hash;
    }, TMP_Enumerable_group_by_47.$$arity = 0);
    Opal.defn(self, '$include?', TMP_Enumerable_include$q_50 = function(obj) {try {

      var TMP_49, self = this;

      
      $send(self, 'each', [], (TMP_49 = function($a_rest){var self = TMP_49.$$s || this, args;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      if (Opal.const_get($scopes, 'Opal', true, true).$destructure(args)['$=='](obj)) {
          Opal.ret(true)
          } else {
          return nil
        }}, TMP_49.$$s = self, TMP_49.$$arity = -1, TMP_49));
      return false;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Enumerable_include$q_50.$$arity = 1);
    Opal.defn(self, '$inject', TMP_Enumerable_inject_51 = function $$inject(object, sym) {
      var self = this, $iter = TMP_Enumerable_inject_51.$$p, block = $iter || nil;

      TMP_Enumerable_inject_51.$$p = null;
      
      var result = object;

      if (block !== nil && sym === undefined) {
        self.$each.$$p = function() {
          var value = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

          if (result === undefined) {
            result = value;
            return;
          }

          value = Opal.yieldX(block, [result, value]);

          result = value;
        };
      }
      else {
        if (sym === undefined) {
          if (!Opal.const_get($scopes, 'Symbol', true, true)['$==='](object)) {
            self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + (object.$inspect()) + " is not a Symbol");
          }

          sym    = object;
          result = undefined;
        }

        self.$each.$$p = function() {
          var value = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

          if (result === undefined) {
            result = value;
            return;
          }

          result = (result).$__send__(sym, value);
        };
      }

      self.$each();

      return result == undefined ? nil : result;
    
    }, TMP_Enumerable_inject_51.$$arity = -1);
    Opal.defn(self, '$lazy', TMP_Enumerable_lazy_53 = function $$lazy() {
      var TMP_52, self = this;

      return $send(Opal.const_get([Opal.const_get($scopes, 'Enumerator', true, true).$$scope], 'Lazy', true, true), 'new', [self, self.$enumerator_size()], (TMP_52 = function(enum$, $a_rest){var self = TMP_52.$$s || this, args;

        var $args_len = arguments.length, $rest_len = $args_len - 1;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 1] = arguments[$arg_idx];
        }if (enum$ == null) enum$ = nil;
      return $send(enum$, 'yield', Opal.to_a(args))}, TMP_52.$$s = self, TMP_52.$$arity = -2, TMP_52))
    }, TMP_Enumerable_lazy_53.$$arity = 0);
    Opal.defn(self, '$enumerator_size', TMP_Enumerable_enumerator_size_54 = function $$enumerator_size() {
      var $a, self = this;

      if ((($a = self['$respond_to?']("size")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$size()
        } else {
        return nil
      }
    }, TMP_Enumerable_enumerator_size_54.$$arity = 0);
    Opal.alias(self, "map", "collect");
    Opal.defn(self, '$max', TMP_Enumerable_max_55 = function $$max(n) {
      var self = this, $iter = TMP_Enumerable_max_55.$$p, block = $iter || nil;

      TMP_Enumerable_max_55.$$p = null;
      
      
      if (n === undefined || n === nil) {
        var result, value;

        self.$each.$$p = function() {
          var item = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

          if (result === undefined) {
            result = item;
            return;
          }

          if (block !== nil) {
            value = Opal.yieldX(block, [item, result]);
          } else {
            value = (item)['$<=>'](result);
          }

          if (value === nil) {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "comparison failed");
          }

          if (value > 0) {
            result = item;
          }
        }

        self.$each();

        if (result === undefined) {
          return nil;
        } else {
          return result;
        }
      }
    ;
      n = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      return $send(self, 'sort', [], block.$to_proc()).$reverse().$first(n);
    }, TMP_Enumerable_max_55.$$arity = -1);
    Opal.defn(self, '$max_by', TMP_Enumerable_max_by_56 = function $$max_by() {
      var TMP_57, self = this, $iter = TMP_Enumerable_max_by_56.$$p, block = $iter || nil;

      TMP_Enumerable_max_by_56.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["max_by"], (TMP_57 = function(){var self = TMP_57.$$s || this;

        return self.$enumerator_size()}, TMP_57.$$s = self, TMP_57.$$arity = 0, TMP_57))
      };
      
      var result,
          by;

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
            value = Opal.yield1(block, param);

        if (result === undefined) {
          result = param;
          by     = value;
          return;
        }

        if ((value)['$<=>'](by) > 0) {
          result = param
          by     = value;
        }
      };

      self.$each();

      return result === undefined ? nil : result;
    ;
    }, TMP_Enumerable_max_by_56.$$arity = 0);
    Opal.alias(self, "member?", "include?");
    Opal.defn(self, '$min', TMP_Enumerable_min_58 = function $$min() {
      var self = this, $iter = TMP_Enumerable_min_58.$$p, block = $iter || nil;

      TMP_Enumerable_min_58.$$p = null;
      
      var result;

      if (block !== nil) {
        self.$each.$$p = function() {
          var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          var value = block(param, result);

          if (value === nil) {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "comparison failed");
          }

          if (value < 0) {
            result = param;
          }
        };
      }
      else {
        self.$each.$$p = function() {
          var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          if (Opal.const_get($scopes, 'Opal', true, true).$compare(param, result) < 0) {
            result = param;
          }
        };
      }

      self.$each();

      return result === undefined ? nil : result;
    
    }, TMP_Enumerable_min_58.$$arity = 0);
    Opal.defn(self, '$min_by', TMP_Enumerable_min_by_59 = function $$min_by() {
      var TMP_60, self = this, $iter = TMP_Enumerable_min_by_59.$$p, block = $iter || nil;

      TMP_Enumerable_min_by_59.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["min_by"], (TMP_60 = function(){var self = TMP_60.$$s || this;

        return self.$enumerator_size()}, TMP_60.$$s = self, TMP_60.$$arity = 0, TMP_60))
      };
      
      var result,
          by;

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
            value = Opal.yield1(block, param);

        if (result === undefined) {
          result = param;
          by     = value;
          return;
        }

        if ((value)['$<=>'](by) < 0) {
          result = param
          by     = value;
        }
      };

      self.$each();

      return result === undefined ? nil : result;
    ;
    }, TMP_Enumerable_min_by_59.$$arity = 0);
    Opal.defn(self, '$minmax', TMP_Enumerable_minmax_61 = function $$minmax() {
      var $a, TMP_62, self = this, $iter = TMP_Enumerable_minmax_61.$$p, block = $iter || nil;

      TMP_Enumerable_minmax_61.$$p = null;
      
      ((($a = block) !== false && $a !== nil && $a != null) ? $a : (block = $send(self, 'proc', [], (TMP_62 = function(a, b){var self = TMP_62.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
      return a['$<=>'](b)}, TMP_62.$$s = self, TMP_62.$$arity = 2, TMP_62))));
      
      var min = nil, max = nil, first_time = true;

      self.$each.$$p = function() {
        var element = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);
        if (first_time) {
          min = max = element;
          first_time = false;
        } else {
          var min_cmp = block.$call(min, element);

          if (min_cmp === nil) {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "comparison failed")
          } else if (min_cmp > 0) {
            min = element;
          }

          var max_cmp = block.$call(max, element);

          if (max_cmp === nil) {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "comparison failed")
          } else if (max_cmp < 0) {
            max = element;
          }
        }
      }

      self.$each();

      return [min, max];
    ;
    }, TMP_Enumerable_minmax_61.$$arity = 0);
    Opal.defn(self, '$minmax_by', TMP_Enumerable_minmax_by_63 = function $$minmax_by() {
      var self = this, $iter = TMP_Enumerable_minmax_by_63.$$p, block = $iter || nil;

      TMP_Enumerable_minmax_by_63.$$p = null;
      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true))
    }, TMP_Enumerable_minmax_by_63.$$arity = 0);
    Opal.defn(self, '$none?', TMP_Enumerable_none$q_64 = function() {try {

      var TMP_65, TMP_66, self = this, $iter = TMP_Enumerable_none$q_64.$$p, block = $iter || nil;

      TMP_Enumerable_none$q_64.$$p = null;
      
      if ((block !== nil)) {
        $send(self, 'each', [], (TMP_65 = function($a_rest){var self = TMP_65.$$s || this, value, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($b = Opal.yieldX(block, Opal.to_a(value))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            Opal.ret(false)
            } else {
            return nil
          }}, TMP_65.$$s = self, TMP_65.$$arity = -1, TMP_65))
        } else {
        $send(self, 'each', [], (TMP_66 = function($a_rest){var self = TMP_66.$$s || this, value, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($b = Opal.const_get($scopes, 'Opal', true, true).$destructure(value)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            Opal.ret(false)
            } else {
            return nil
          }}, TMP_66.$$s = self, TMP_66.$$arity = -1, TMP_66))
      };
      return true;
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Enumerable_none$q_64.$$arity = 0);
    Opal.defn(self, '$one?', TMP_Enumerable_one$q_67 = function() {try {

      var TMP_68, TMP_69, self = this, $iter = TMP_Enumerable_one$q_67.$$p, block = $iter || nil, count = nil;

      TMP_Enumerable_one$q_67.$$p = null;
      
      count = 0;
      if ((block !== nil)) {
        $send(self, 'each', [], (TMP_68 = function($a_rest){var self = TMP_68.$$s || this, value, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($b = Opal.yieldX(block, Opal.to_a(value))) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            
            (count = $rb_plus(count, 1));
            if ((($b = $rb_gt(count, 1)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
              Opal.ret(false)
              } else {
              return nil
            };
            } else {
            return nil
          }}, TMP_68.$$s = self, TMP_68.$$arity = -1, TMP_68))
        } else {
        $send(self, 'each', [], (TMP_69 = function($a_rest){var self = TMP_69.$$s || this, value, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 0;
          if ($rest_len < 0) { $rest_len = 0; }
          value = new Array($rest_len);
          for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
            value[$arg_idx - 0] = arguments[$arg_idx];
          }
        if ((($b = Opal.const_get($scopes, 'Opal', true, true).$destructure(value)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            
            (count = $rb_plus(count, 1));
            if ((($b = $rb_gt(count, 1)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
              Opal.ret(false)
              } else {
              return nil
            };
            } else {
            return nil
          }}, TMP_69.$$s = self, TMP_69.$$arity = -1, TMP_69))
      };
      return count['$=='](1);
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Enumerable_one$q_67.$$arity = 0);
    Opal.defn(self, '$partition', TMP_Enumerable_partition_70 = function $$partition() {
      var TMP_71, $a, self = this, $iter = TMP_Enumerable_partition_70.$$p, block = $iter || nil;

      TMP_Enumerable_partition_70.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["partition"], (TMP_71 = function(){var self = TMP_71.$$s || this;

        return self.$enumerator_size()}, TMP_71.$$s = self, TMP_71.$$arity = 0, TMP_71))
      };
      
      var truthy = [], falsy = [], result;

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
            value = Opal.yield1(block, param);

        if ((($a = value) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          truthy.push(param);
        }
        else {
          falsy.push(param);
        }
      };

      self.$each();

      return [truthy, falsy];
    ;
    }, TMP_Enumerable_partition_70.$$arity = 0);
    Opal.alias(self, "reduce", "inject");
    Opal.defn(self, '$reject', TMP_Enumerable_reject_72 = function $$reject() {
      var TMP_73, $a, self = this, $iter = TMP_Enumerable_reject_72.$$p, block = $iter || nil;

      TMP_Enumerable_reject_72.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["reject"], (TMP_73 = function(){var self = TMP_73.$$s || this;

        return self.$enumerator_size()}, TMP_73.$$s = self, TMP_73.$$arity = 0, TMP_73))
      };
      
      var result = [];

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
            value = Opal.yield1(block, param);

        if ((($a = value) === nil || $a == null || ($a.$$is_boolean && $a == false))) {
          result.push(param);
        }
      };

      self.$each();

      return result;
    ;
    }, TMP_Enumerable_reject_72.$$arity = 0);
    Opal.defn(self, '$reverse_each', TMP_Enumerable_reverse_each_74 = function $$reverse_each() {
      var TMP_75, self = this, $iter = TMP_Enumerable_reverse_each_74.$$p, block = $iter || nil;

      TMP_Enumerable_reverse_each_74.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["reverse_each"], (TMP_75 = function(){var self = TMP_75.$$s || this;

        return self.$enumerator_size()}, TMP_75.$$s = self, TMP_75.$$arity = 0, TMP_75))
      };
      
      var result = [];

      self.$each.$$p = function() {
        result.push(arguments);
      };

      self.$each();

      for (var i = result.length - 1; i >= 0; i--) {
        Opal.yieldX(block, result[i]);
      }

      return result;
    ;
    }, TMP_Enumerable_reverse_each_74.$$arity = 0);
    Opal.alias(self, "select", "find_all");
    Opal.defn(self, '$slice_before', TMP_Enumerable_slice_before_76 = function $$slice_before(pattern) {
      var $a, TMP_77, self = this, $iter = TMP_Enumerable_slice_before_76.$$p, block = $iter || nil;

      TMP_Enumerable_slice_before_76.$$p = null;
      
      if ((($a = pattern === undefined && block === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "both pattern and block are given")};
      if ((($a = pattern !== undefined && block !== nil || arguments.length > 1) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (arguments.length) + " expected 1)")};
      return $send(Opal.const_get($scopes, 'Enumerator', true, true), 'new', [], (TMP_77 = function(e){var self = TMP_77.$$s || this, $b;
if (e == null) e = nil;
      
        var slice = [];

        if (block !== nil) {
          if (pattern === undefined) {
            self.$each.$$p = function() {
              var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
                  value = Opal.yield1(block, param);

              if ((($b = value) !== nil && $b != null && (!$b.$$is_boolean || $b == true)) && slice.length > 0) {
                e['$<<'](slice);
                slice = [];
              }

              slice.push(param);
            };
          }
          else {
            self.$each.$$p = function() {
              var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
                  value = block(param, pattern.$dup());

              if ((($b = value) !== nil && $b != null && (!$b.$$is_boolean || $b == true)) && slice.length > 0) {
                e['$<<'](slice);
                slice = [];
              }

              slice.push(param);
            };
          }
        }
        else {
          self.$each.$$p = function() {
            var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
                value = pattern['$==='](param);

            if ((($b = value) !== nil && $b != null && (!$b.$$is_boolean || $b == true)) && slice.length > 0) {
              e['$<<'](slice);
              slice = [];
            }

            slice.push(param);
          };
        }

        self.$each();

        if (slice.length > 0) {
          e['$<<'](slice);
        }
      }, TMP_77.$$s = self, TMP_77.$$arity = 1, TMP_77));
    }, TMP_Enumerable_slice_before_76.$$arity = -1);
    Opal.defn(self, '$slice_after', TMP_Enumerable_slice_after_78 = function $$slice_after(pattern) {
      var $a, TMP_79, TMP_80, self = this, $iter = TMP_Enumerable_slice_after_78.$$p, block = $iter || nil;

      TMP_Enumerable_slice_after_78.$$p = null;
      
      if ((($a = pattern === undefined && block === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "both pattern and block are given")};
      if ((($a = pattern !== undefined && block !== nil || arguments.length > 1) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (arguments.length) + " expected 1)")};
      if ((($a = pattern !== undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        block = $send(self, 'proc', [], (TMP_79 = function(e){var self = TMP_79.$$s || this;
if (e == null) e = nil;
        return pattern['$==='](e)}, TMP_79.$$s = self, TMP_79.$$arity = 1, TMP_79))};
      return $send(Opal.const_get($scopes, 'Enumerator', true, true), 'new', [], (TMP_80 = function(yielder){var self = TMP_80.$$s || this, $b;
if (yielder == null) yielder = nil;
      
        var accumulate;

        self.$each.$$p = function() {
          var element = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
              end_chunk = Opal.yield1(block, element);

          if (accumulate == null) {
            accumulate = [];
          }

          if ((($b = end_chunk) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            accumulate.push(element);
            yielder.$yield(accumulate);
            accumulate = null;
          } else {
            accumulate.push(element)
          }
        }

        self.$each();

        if (accumulate != null) {
          yielder.$yield(accumulate);
        }
      }, TMP_80.$$s = self, TMP_80.$$arity = 1, TMP_80));
    }, TMP_Enumerable_slice_after_78.$$arity = -1);
    Opal.defn(self, '$slice_when', TMP_Enumerable_slice_when_81 = function $$slice_when() {
      var TMP_82, self = this, $iter = TMP_Enumerable_slice_when_81.$$p, block = $iter || nil;

      TMP_Enumerable_slice_when_81.$$p = null;
      
      if ((block !== nil)) {
        } else {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "wrong number of arguments (0 for 1)")
      };
      return $send(Opal.const_get($scopes, 'Enumerator', true, true), 'new', [], (TMP_82 = function(yielder){var self = TMP_82.$$s || this, $a;
if (yielder == null) yielder = nil;
      
        var slice = nil, last_after = nil;

        self.$each_cons.$$p = function() {
          var params = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
              before = params[0],
              after = params[1],
              match = Opal.yieldX(block, [before, after]);

          last_after = after;

          if (slice === nil) {
            slice = [];
          }

          if ((($a = match) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            slice.push(before);
            yielder.$yield(slice);
            slice = [];
          } else {
            slice.push(before);
          }
        }

        self.$each_cons(2);

        if (slice !== nil) {
          slice.push(last_after);
          yielder.$yield(slice);
        }
      }, TMP_82.$$s = self, TMP_82.$$arity = 1, TMP_82));
    }, TMP_Enumerable_slice_when_81.$$arity = 0);
    Opal.defn(self, '$sort', TMP_Enumerable_sort_83 = function $$sort() {
      var TMP_84, self = this, $iter = TMP_Enumerable_sort_83.$$p, block = $iter || nil, ary = nil;

      TMP_Enumerable_sort_83.$$p = null;
      
      ary = self.$to_a();
      if ((block !== nil)) {
        } else {
        block = $send(self, 'lambda', [], (TMP_84 = function(a, b){var self = TMP_84.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
        return a['$<=>'](b)}, TMP_84.$$s = self, TMP_84.$$arity = 2, TMP_84))
      };
      return $send(ary, 'sort', [], block.$to_proc());
    }, TMP_Enumerable_sort_83.$$arity = 0);
    Opal.defn(self, '$sort_by', TMP_Enumerable_sort_by_85 = function $$sort_by() {
      var TMP_86, TMP_87, TMP_88, TMP_89, self = this, $iter = TMP_Enumerable_sort_by_85.$$p, block = $iter || nil, dup = nil;

      TMP_Enumerable_sort_by_85.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["sort_by"], (TMP_86 = function(){var self = TMP_86.$$s || this;

        return self.$enumerator_size()}, TMP_86.$$s = self, TMP_86.$$arity = 0, TMP_86))
      };
      dup = $send(self, 'map', [], (TMP_87 = function(){var self = TMP_87.$$s || this, arg = nil;

      
        arg = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments);
        return [Opal.yield1(block, arg), arg];}, TMP_87.$$s = self, TMP_87.$$arity = 0, TMP_87));
      $send(dup, 'sort!', [], (TMP_88 = function(a, b){var self = TMP_88.$$s || this;
if (a == null) a = nil;if (b == null) b = nil;
      return (a[0])['$<=>'](b[0])}, TMP_88.$$s = self, TMP_88.$$arity = 2, TMP_88));
      return $send(dup, 'map!', [], (TMP_89 = function(i){var self = TMP_89.$$s || this;
if (i == null) i = nil;
      return i[1]}, TMP_89.$$s = self, TMP_89.$$arity = 1, TMP_89));
    }, TMP_Enumerable_sort_by_85.$$arity = 0);
    Opal.defn(self, '$take', TMP_Enumerable_take_90 = function $$take(num) {
      var self = this;

      return self.$first(num)
    }, TMP_Enumerable_take_90.$$arity = 1);
    Opal.defn(self, '$take_while', TMP_Enumerable_take_while_91 = function $$take_while() {try {

      var TMP_92, self = this, $iter = TMP_Enumerable_take_while_91.$$p, block = $iter || nil, result = nil;

      TMP_Enumerable_take_while_91.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return self.$enum_for("take_while")
      };
      result = [];
      return $send(self, 'each', [], (TMP_92 = function($a_rest){var self = TMP_92.$$s || this, args, $b, value = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
      
        value = Opal.const_get($scopes, 'Opal', true, true).$destructure(args);
        if ((($b = Opal.yield1(block, value)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          } else {
          Opal.ret(result)
        };
        return result.push(value);}, TMP_92.$$s = self, TMP_92.$$arity = -1, TMP_92));
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Enumerable_take_while_91.$$arity = 0);
    Opal.alias(self, "to_a", "entries");
    Opal.defn(self, '$zip', TMP_Enumerable_zip_93 = function $$zip($a_rest) {
      var self = this, others, $iter = TMP_Enumerable_zip_93.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      others = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        others[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Enumerable_zip_93.$$p = null;
      return $send(self.$to_a(), 'zip', Opal.to_a(others))
    }, TMP_Enumerable_zip_93.$$arity = -1);
  })($scope.base, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/enumerator"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send;

  Opal.add_stubs(['$require', '$include', '$allocate', '$new', '$to_proc', '$coerce_to', '$nil?', '$empty?', '$+', '$class', '$__send__', '$===', '$call', '$enum_for', '$size', '$destructure', '$inspect', '$[]', '$raise', '$yield', '$each', '$enumerator_size', '$respond_to?', '$try_convert', '$<', '$for']);
  
  self.$require("corelib/enumerable");
  return (function($base, $super, $visibility_scopes) {
    function $Enumerator(){};
    var self = $Enumerator = $klass($base, $super, 'Enumerator', $Enumerator);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Enumerator_for_1, TMP_Enumerator_initialize_2, TMP_Enumerator_each_3, TMP_Enumerator_size_4, TMP_Enumerator_with_index_5, TMP_Enumerator_inspect_7;

    def.size = def.args = def.object = def.method = nil;
    
    self.$include(Opal.const_get($scopes, 'Enumerable', true, true));
    def.$$is_enumerator = true;
    Opal.defs(self, '$for', TMP_Enumerator_for_1 = function(object, method, $a_rest) {
      var self = this, args, $iter = TMP_Enumerator_for_1.$$p, block = $iter || nil;

      if (method == null) {
        method = "each";
      }
      var $args_len = arguments.length, $rest_len = $args_len - 2;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 2; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 2] = arguments[$arg_idx];
      }
      TMP_Enumerator_for_1.$$p = null;
      
      var obj = self.$allocate();

      obj.object = object;
      obj.size   = block;
      obj.method = method;
      obj.args   = args;

      return obj;
    
    }, TMP_Enumerator_for_1.$$arity = -2);
    Opal.defn(self, '$initialize', TMP_Enumerator_initialize_2 = function $$initialize($a_rest) {
      var $b, self = this, $iter = TMP_Enumerator_initialize_2.$$p, block = $iter || nil;

      TMP_Enumerator_initialize_2.$$p = null;
      if (block !== false && block !== nil && block != null) {
        
        self.object = $send(Opal.const_get($scopes, 'Generator', true, true), 'new', [], block.$to_proc());
        self.method = "each";
        self.args = [];
        self.size = arguments[0] || nil;
        if ((($b = self.size) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return (self.size = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(self.size, Opal.const_get($scopes, 'Integer', true, true), "to_int"))
          } else {
          return nil
        };
        } else {
        
        self.object = arguments[0];
        self.method = arguments[1] || "each";
        self.args = $slice.call(arguments, 2);
        return (self.size = nil);
      }
    }, TMP_Enumerator_initialize_2.$$arity = -1);
    Opal.defn(self, '$each', TMP_Enumerator_each_3 = function $$each($a_rest) {
      var $b, $c, self = this, args, $iter = TMP_Enumerator_each_3.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Enumerator_each_3.$$p = null;
      
      if ((($b = ($c = block['$nil?'](), $c !== false && $c !== nil && $c != null ?args['$empty?']() : $c)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return self};
      args = $rb_plus(self.args, args);
      if ((($b = block['$nil?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        return $send(self.$class(), 'new', [self.object, self.method].concat(Opal.to_a(args)))};
      return $send(self.object, '__send__', [self.method].concat(Opal.to_a(args)), block.$to_proc());
    }, TMP_Enumerator_each_3.$$arity = -1);
    Opal.defn(self, '$size', TMP_Enumerator_size_4 = function $$size() {
      var $a, self = this;

      if ((($a = Opal.const_get($scopes, 'Proc', true, true)['$==='](self.size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $send(self.size, 'call', Opal.to_a(self.args))
        } else {
        return self.size
      }
    }, TMP_Enumerator_size_4.$$arity = 0);
    Opal.defn(self, '$with_index', TMP_Enumerator_with_index_5 = function $$with_index(offset) {
      var TMP_6, self = this, $iter = TMP_Enumerator_with_index_5.$$p, block = $iter || nil;

      if (offset == null) {
        offset = 0;
      }
      TMP_Enumerator_with_index_5.$$p = null;
      
      if (offset !== false && offset !== nil && offset != null) {
        offset = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(offset, Opal.const_get($scopes, 'Integer', true, true), "to_int")
        } else {
        offset = 0
      };
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["with_index", offset], (TMP_6 = function(){var self = TMP_6.$$s || this;

        return self.$size()}, TMP_6.$$s = self, TMP_6.$$arity = 0, TMP_6))
      };
      
      var result, index = offset;

      self.$each.$$p = function() {
        var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(arguments),
            value = block(param, index);

        index++;

        return value;
      }

      return self.$each();
    ;
    }, TMP_Enumerator_with_index_5.$$arity = -1);
    Opal.alias(self, "with_object", "each_with_object");
    Opal.defn(self, '$inspect', TMP_Enumerator_inspect_7 = function $$inspect() {
      var $a, self = this, result = nil;

      
      result = "" + "#<" + (self.$class()) + ": " + (self.object.$inspect()) + ":" + (self.method);
      if ((($a = self.args['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        (result = $rb_plus(result, "" + "(" + (self.args.$inspect()['$[]'](Opal.const_get($scopes, 'Range', true, true).$new(1, -2))) + ")"))
      };
      return $rb_plus(result, ">");
    }, TMP_Enumerator_inspect_7.$$arity = 0);
    (function($base, $super, $visibility_scopes) {
      function $Generator(){};
      var self = $Generator = $klass($base, $super, 'Generator', $Generator);

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Generator_initialize_8, TMP_Generator_each_9;

      def.block = nil;
      
      self.$include(Opal.const_get($scopes, 'Enumerable', true, true));
      Opal.defn(self, '$initialize', TMP_Generator_initialize_8 = function $$initialize() {
        var self = this, $iter = TMP_Generator_initialize_8.$$p, block = $iter || nil;

        TMP_Generator_initialize_8.$$p = null;
        
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise(Opal.const_get($scopes, 'LocalJumpError', true, true), "no block given")
        };
        return (self.block = block);
      }, TMP_Generator_initialize_8.$$arity = 0);
      return (Opal.defn(self, '$each', TMP_Generator_each_9 = function $$each($a_rest) {
        var self = this, args, $iter = TMP_Generator_each_9.$$p, block = $iter || nil, yielder = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
        TMP_Generator_each_9.$$p = null;
        
        yielder = $send(Opal.const_get($scopes, 'Yielder', true, true), 'new', [], block.$to_proc());
        
        try {
          args.unshift(yielder);

          Opal.yieldX(self.block, args);
        }
        catch (e) {
          if (e === $breaker) {
            return $breaker.$v;
          }
          else {
            throw e;
          }
        }
      ;
        return self;
      }, TMP_Generator_each_9.$$arity = -1), nil) && 'each';
    })($scope.base, null, $scopes);
    (function($base, $super, $visibility_scopes) {
      function $Yielder(){};
      var self = $Yielder = $klass($base, $super, 'Yielder', $Yielder);

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Yielder_initialize_10, TMP_Yielder_yield_11, TMP_Yielder_$lt$lt_12;

      def.block = nil;
      
      Opal.defn(self, '$initialize', TMP_Yielder_initialize_10 = function $$initialize() {
        var self = this, $iter = TMP_Yielder_initialize_10.$$p, block = $iter || nil;

        TMP_Yielder_initialize_10.$$p = null;
        return (self.block = block)
      }, TMP_Yielder_initialize_10.$$arity = 0);
      Opal.defn(self, '$yield', TMP_Yielder_yield_11 = function($a_rest) {
        var self = this, values;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        values = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          values[$arg_idx - 0] = arguments[$arg_idx];
        }
        
        var value = Opal.yieldX(self.block, values);

        if (value === $breaker) {
          throw $breaker;
        }

        return value;
      
      }, TMP_Yielder_yield_11.$$arity = -1);
      return (Opal.defn(self, '$<<', TMP_Yielder_$lt$lt_12 = function($a_rest) {
        var self = this, values;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        values = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          values[$arg_idx - 0] = arguments[$arg_idx];
        }
        
        $send(self, 'yield', Opal.to_a(values));
        return self;
      }, TMP_Yielder_$lt$lt_12.$$arity = -1), nil) && '<<';
    })($scope.base, null, $scopes);
    return (function($base, $super, $visibility_scopes) {
      function $Lazy(){};
      var self = $Lazy = $klass($base, $super, 'Lazy', $Lazy);

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Lazy_initialize_13, TMP_Lazy_lazy_16, TMP_Lazy_collect_17, TMP_Lazy_collect_concat_19, TMP_Lazy_drop_24, TMP_Lazy_drop_while_25, TMP_Lazy_enum_for_27, TMP_Lazy_find_all_28, TMP_Lazy_grep_30, TMP_Lazy_reject_33, TMP_Lazy_take_36, TMP_Lazy_take_while_37, TMP_Lazy_inspect_39;

      def.enumerator = nil;
      
      (function($base, $super, $visibility_scopes) {
        function $StopLazyError(){};
        var self = $StopLazyError = $klass($base, $super, 'StopLazyError', $StopLazyError);

        var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

        return nil
      })($scope.base, Opal.const_get($scopes, 'Exception', true, true), $scopes);
      Opal.defn(self, '$initialize', TMP_Lazy_initialize_13 = function $$initialize(object, size) {
        var TMP_14, self = this, $iter = TMP_Lazy_initialize_13.$$p, block = $iter || nil;

        if (size == null) {
          size = nil;
        }
        TMP_Lazy_initialize_13.$$p = null;
        
        if ((block !== nil)) {
          } else {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to call lazy new without a block")
        };
        self.enumerator = object;
        return $send(self, Opal.find_super_dispatcher(self, 'initialize', TMP_Lazy_initialize_13, false), [size], (TMP_14 = function(yielder, $a_rest){var self = TMP_14.$$s || this, each_args, TMP_15;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          each_args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            each_args[$arg_idx - 1] = arguments[$arg_idx];
          }if (yielder == null) yielder = nil;
        
          try {
            return $send(object, 'each', Opal.to_a(each_args), (TMP_15 = function($a_rest){var self = TMP_15.$$s || this, args;

              var $args_len = arguments.length, $rest_len = $args_len - 0;
              if ($rest_len < 0) { $rest_len = 0; }
              args = new Array($rest_len);
              for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
                args[$arg_idx - 0] = arguments[$arg_idx];
              }
            
              args.unshift(yielder);

              Opal.yieldX(block, args);
            }, TMP_15.$$s = self, TMP_15.$$arity = -1, TMP_15))
          } catch ($err) {
            if (Opal.rescue($err, [Opal.const_get($scopes, 'Exception', true, true)])) {
              try {
                return nil
              } finally { Opal.pop_exception() }
            } else { throw $err; }
          };}, TMP_14.$$s = self, TMP_14.$$arity = -2, TMP_14));
      }, TMP_Lazy_initialize_13.$$arity = -2);
      Opal.alias(self, "force", "to_a");
      Opal.defn(self, '$lazy', TMP_Lazy_lazy_16 = function $$lazy() {
        var self = this;

        return self
      }, TMP_Lazy_lazy_16.$$arity = 0);
      Opal.defn(self, '$collect', TMP_Lazy_collect_17 = function $$collect() {
        var TMP_18, self = this, $iter = TMP_Lazy_collect_17.$$p, block = $iter || nil;

        TMP_Lazy_collect_17.$$p = null;
        
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to call lazy map without a block")
        };
        return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, self.$enumerator_size()], (TMP_18 = function(enum$, $a_rest){var self = TMP_18.$$s || this, args;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          enum$.$yield(value);
        }, TMP_18.$$s = self, TMP_18.$$arity = -2, TMP_18));
      }, TMP_Lazy_collect_17.$$arity = 0);
      Opal.defn(self, '$collect_concat', TMP_Lazy_collect_concat_19 = function $$collect_concat() {
        var TMP_20, self = this, $iter = TMP_Lazy_collect_concat_19.$$p, block = $iter || nil;

        TMP_Lazy_collect_concat_19.$$p = null;
        
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to call lazy map without a block")
        };
        return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, nil], (TMP_20 = function(enum$, $a_rest){var self = TMP_20.$$s || this, args, TMP_21, TMP_22;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          if ((value)['$respond_to?']("force") && (value)['$respond_to?']("each")) {
            $send((value), 'each', [], (TMP_21 = function(v){var self = TMP_21.$$s || this;
if (v == null) v = nil;
          return enum$.$yield(v)}, TMP_21.$$s = self, TMP_21.$$arity = 1, TMP_21))
          }
          else {
            var array = Opal.const_get($scopes, 'Opal', true, true).$try_convert(value, Opal.const_get($scopes, 'Array', true, true), "to_ary");

            if (array === nil) {
              enum$.$yield(value);
            }
            else {
              $send((value), 'each', [], (TMP_22 = function(v){var self = TMP_22.$$s || this;
if (v == null) v = nil;
          return enum$.$yield(v)}, TMP_22.$$s = self, TMP_22.$$arity = 1, TMP_22));
            }
          }
        }, TMP_20.$$s = self, TMP_20.$$arity = -2, TMP_20));
      }, TMP_Lazy_collect_concat_19.$$arity = 0);
      Opal.defn(self, '$drop', TMP_Lazy_drop_24 = function $$drop(n) {
        var $a, TMP_23, self = this, current_size = nil, set_size = nil, dropped = nil;

        
        n = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($a = $rb_lt(n, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "attempt to drop negative size")};
        current_size = self.$enumerator_size();
        set_size = (function() {if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](current_size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          if ((($a = $rb_lt(n, current_size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return n
            } else {
            return current_size
          }
          } else {
          return current_size
        }; return nil; })();
        dropped = 0;
        return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, set_size], (TMP_23 = function(enum$, $b_rest){var self = TMP_23.$$s || this, args, $c;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        if ((($c = $rb_lt(dropped, n)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            return (dropped = $rb_plus(dropped, 1))
            } else {
            return $send(enum$, 'yield', Opal.to_a(args))
          }}, TMP_23.$$s = self, TMP_23.$$arity = -2, TMP_23));
      }, TMP_Lazy_drop_24.$$arity = 1);
      Opal.defn(self, '$drop_while', TMP_Lazy_drop_while_25 = function $$drop_while() {
        var TMP_26, self = this, $iter = TMP_Lazy_drop_while_25.$$p, block = $iter || nil, succeeding = nil;

        TMP_Lazy_drop_while_25.$$p = null;
        
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to call lazy drop_while without a block")
        };
        succeeding = true;
        return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, nil], (TMP_26 = function(enum$, $a_rest){var self = TMP_26.$$s || this, args, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        if (succeeding !== false && succeeding !== nil && succeeding != null) {
            
            var value = Opal.yieldX(block, args);

            if ((($b = value) === nil || $b == null || ($b.$$is_boolean && $b == false))) {
              succeeding = false;

              $send(enum$, 'yield', Opal.to_a(args));
            }
          
            } else {
            return $send(enum$, 'yield', Opal.to_a(args))
          }}, TMP_26.$$s = self, TMP_26.$$arity = -2, TMP_26));
      }, TMP_Lazy_drop_while_25.$$arity = 0);
      Opal.defn(self, '$enum_for', TMP_Lazy_enum_for_27 = function $$enum_for(method, $a_rest) {
        var self = this, args, $iter = TMP_Lazy_enum_for_27.$$p, block = $iter || nil;

        if (method == null) {
          method = "each";
        }
        var $args_len = arguments.length, $rest_len = $args_len - 1;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 1] = arguments[$arg_idx];
        }
        TMP_Lazy_enum_for_27.$$p = null;
        return $send(self.$class(), 'for', [self, method].concat(Opal.to_a(args)), block.$to_proc())
      }, TMP_Lazy_enum_for_27.$$arity = -1);
      Opal.defn(self, '$find_all', TMP_Lazy_find_all_28 = function $$find_all() {
        var TMP_29, self = this, $iter = TMP_Lazy_find_all_28.$$p, block = $iter || nil;

        TMP_Lazy_find_all_28.$$p = null;
        
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to call lazy select without a block")
        };
        return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, nil], (TMP_29 = function(enum$, $a_rest){var self = TMP_29.$$s || this, args, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          if ((($b = value) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            $send(enum$, 'yield', Opal.to_a(args));
          }
        }, TMP_29.$$s = self, TMP_29.$$arity = -2, TMP_29));
      }, TMP_Lazy_find_all_28.$$arity = 0);
      Opal.alias(self, "flat_map", "collect_concat");
      Opal.defn(self, '$grep', TMP_Lazy_grep_30 = function $$grep(pattern) {
        var TMP_31, TMP_32, self = this, $iter = TMP_Lazy_grep_30.$$p, block = $iter || nil;

        TMP_Lazy_grep_30.$$p = null;
        if (block !== false && block !== nil && block != null) {
          return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, nil], (TMP_31 = function(enum$, $a_rest){var self = TMP_31.$$s || this, args, $b;

            var $args_len = arguments.length, $rest_len = $args_len - 1;
            if ($rest_len < 0) { $rest_len = 0; }
            args = new Array($rest_len);
            for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
              args[$arg_idx - 1] = arguments[$arg_idx];
            }if (enum$ == null) enum$ = nil;
          
            var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(args),
                value = pattern['$==='](param);

            if ((($b = value) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
              value = Opal.yield1(block, param);

              enum$.$yield(Opal.yield1(block, param));
            }
          }, TMP_31.$$s = self, TMP_31.$$arity = -2, TMP_31))
          } else {
          return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, nil], (TMP_32 = function(enum$, $a_rest){var self = TMP_32.$$s || this, args, $b;

            var $args_len = arguments.length, $rest_len = $args_len - 1;
            if ($rest_len < 0) { $rest_len = 0; }
            args = new Array($rest_len);
            for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
              args[$arg_idx - 1] = arguments[$arg_idx];
            }if (enum$ == null) enum$ = nil;
          
            var param = Opal.const_get($scopes, 'Opal', true, true).$destructure(args),
                value = pattern['$==='](param);

            if ((($b = value) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
              enum$.$yield(param);
            }
          }, TMP_32.$$s = self, TMP_32.$$arity = -2, TMP_32))
        }
      }, TMP_Lazy_grep_30.$$arity = 1);
      Opal.alias(self, "map", "collect");
      Opal.alias(self, "select", "find_all");
      Opal.defn(self, '$reject', TMP_Lazy_reject_33 = function $$reject() {
        var TMP_34, self = this, $iter = TMP_Lazy_reject_33.$$p, block = $iter || nil;

        TMP_Lazy_reject_33.$$p = null;
        
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to call lazy reject without a block")
        };
        return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, nil], (TMP_34 = function(enum$, $a_rest){var self = TMP_34.$$s || this, args, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          if ((($b = value) === nil || $b == null || ($b.$$is_boolean && $b == false))) {
            $send(enum$, 'yield', Opal.to_a(args));
          }
        }, TMP_34.$$s = self, TMP_34.$$arity = -2, TMP_34));
      }, TMP_Lazy_reject_33.$$arity = 0);
      Opal.defn(self, '$take', TMP_Lazy_take_36 = function $$take(n) {
        var $a, TMP_35, self = this, current_size = nil, set_size = nil, taken = nil;

        
        n = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($a = $rb_lt(n, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "attempt to take negative size")};
        current_size = self.$enumerator_size();
        set_size = (function() {if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](current_size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          if ((($a = $rb_lt(n, current_size)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return n
            } else {
            return current_size
          }
          } else {
          return current_size
        }; return nil; })();
        taken = 0;
        return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, set_size], (TMP_35 = function(enum$, $b_rest){var self = TMP_35.$$s || this, args, $c;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        if ((($c = $rb_lt(taken, n)) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
            
            $send(enum$, 'yield', Opal.to_a(args));
            return (taken = $rb_plus(taken, 1));
            } else {
            return self.$raise(Opal.const_get($scopes, 'StopLazyError', true, true))
          }}, TMP_35.$$s = self, TMP_35.$$arity = -2, TMP_35));
      }, TMP_Lazy_take_36.$$arity = 1);
      Opal.defn(self, '$take_while', TMP_Lazy_take_while_37 = function $$take_while() {
        var TMP_38, self = this, $iter = TMP_Lazy_take_while_37.$$p, block = $iter || nil;

        TMP_Lazy_take_while_37.$$p = null;
        
        if (block !== false && block !== nil && block != null) {
          } else {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to call lazy take_while without a block")
        };
        return $send(Opal.const_get($scopes, 'Lazy', true, true), 'new', [self, nil], (TMP_38 = function(enum$, $a_rest){var self = TMP_38.$$s || this, args, $b;

          var $args_len = arguments.length, $rest_len = $args_len - 1;
          if ($rest_len < 0) { $rest_len = 0; }
          args = new Array($rest_len);
          for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
            args[$arg_idx - 1] = arguments[$arg_idx];
          }if (enum$ == null) enum$ = nil;
        
          var value = Opal.yieldX(block, args);

          if ((($b = value) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            $send(enum$, 'yield', Opal.to_a(args));
          }
          else {
            self.$raise(Opal.const_get($scopes, 'StopLazyError', true, true));
          }
        }, TMP_38.$$s = self, TMP_38.$$arity = -2, TMP_38));
      }, TMP_Lazy_take_while_37.$$arity = 0);
      Opal.alias(self, "to_enum", "enum_for");
      return (Opal.defn(self, '$inspect', TMP_Lazy_inspect_39 = function $$inspect() {
        var self = this;

        return "" + "#<" + (self.$class()) + ": " + (self.enumerator.$inspect()) + ">"
      }, TMP_Lazy_inspect_39.$$arity = 0), nil) && 'inspect';
    })($scope.base, self, $scopes);
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/numeric"] = function(Opal) {
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$require', '$include', '$instance_of?', '$class', '$Float', '$coerce', '$===', '$raise', '$__send__', '$equal?', '$coerce_to!', '$-@', '$**', '$-', '$*', '$div', '$<', '$ceil', '$to_f', '$denominator', '$to_r', '$==', '$floor', '$/', '$%', '$Complex', '$zero?', '$numerator', '$abs', '$arg', '$round', '$to_i', '$truncate', '$>']);
  
  self.$require("corelib/comparable");
  return (function($base, $super, $visibility_scopes) {
    function $Numeric(){};
    var self = $Numeric = $klass($base, $super, 'Numeric', $Numeric);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Numeric_coerce_1, TMP_Numeric___coerced___2, TMP_Numeric_$lt$eq$gt_3, TMP_Numeric_$$_4, TMP_Numeric_$$_5, TMP_Numeric_$$_6, TMP_Numeric_$_7, TMP_Numeric_abs_8, TMP_Numeric_abs2_9, TMP_Numeric_angle_10, TMP_Numeric_ceil_11, TMP_Numeric_conj_12, TMP_Numeric_denominator_13, TMP_Numeric_div_14, TMP_Numeric_divmod_15, TMP_Numeric_fdiv_16, TMP_Numeric_floor_17, TMP_Numeric_i_18, TMP_Numeric_imag_19, TMP_Numeric_integer$q_20, TMP_Numeric_nonzero$q_21, TMP_Numeric_numerator_22, TMP_Numeric_polar_23, TMP_Numeric_quo_24, TMP_Numeric_real_25, TMP_Numeric_real$q_26, TMP_Numeric_rect_27, TMP_Numeric_round_28, TMP_Numeric_to_c_29, TMP_Numeric_to_int_30, TMP_Numeric_truncate_31, TMP_Numeric_zero$q_32, TMP_Numeric_positive$q_33, TMP_Numeric_negative$q_34, TMP_Numeric_dup_35, TMP_Numeric_clone_36;

    
    self.$include(Opal.const_get($scopes, 'Comparable', true, true));
    Opal.defn(self, '$coerce', TMP_Numeric_coerce_1 = function $$coerce(other) {
      var $a, self = this;

      
      if ((($a = other['$instance_of?'](self.$class())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [other, self]};
      return [self.$Float(other), self.$Float(self)];
    }, TMP_Numeric_coerce_1.$$arity = 1);
    Opal.defn(self, '$__coerced__', TMP_Numeric___coerced___2 = function $$__coerced__(method, other) {
      var $a, $b, self = this, a = nil, b = nil, $case = nil;

      
      
      try {
        $b = other.$coerce(self), $a = Opal.to_ary($b), (a = ($a[0] == null ? nil : $a[0])), (b = ($a[1] == null ? nil : $a[1])), $b
      } catch ($err) {
        if (Opal.rescue($err, [Opal.const_get($scopes, 'StandardError', true, true)])) {
          try {
            $case = method;
if ("+"['$===']($case) || "-"['$===']($case) || "*"['$===']($case) || "/"['$===']($case) || "%"['$===']($case) || "&"['$===']($case) || "|"['$===']($case) || "^"['$===']($case) || "**"['$===']($case)) {self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + (other.$class()) + " can't be coerce into Numeric")}else if (">"['$===']($case) || ">="['$===']($case) || "<"['$===']($case) || "<="['$===']($case) || "<=>"['$===']($case)) {self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")}
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };;
      return a.$__send__(method, b);
    }, TMP_Numeric___coerced___2.$$arity = 2);
    Opal.defn(self, '$<=>', TMP_Numeric_$lt$eq$gt_3 = function(other) {
      var $a, self = this;

      
      if ((($a = self['$equal?'](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 0};
      return nil;
    }, TMP_Numeric_$lt$eq$gt_3.$$arity = 1);
    Opal.defn(self, '$[]', TMP_Numeric_$$_4 = function(bit) {
      var self = this, min = nil, max = nil;

      
      bit = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](bit, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      min = (2)['$**'](30)['$-@']();
      max = $rb_minus((2)['$**'](30), 1);
      return (bit < min || bit > max) ? 0 : (self >> bit) % 2;
    }, TMP_Numeric_$$_4.$$arity = 1);
    Opal.defn(self, '$+@', TMP_Numeric_$$_5 = function() {
      var self = this;

      return self
    }, TMP_Numeric_$$_5.$$arity = 0);
    Opal.defn(self, '$-@', TMP_Numeric_$$_6 = function() {
      var self = this;

      return $rb_minus(0, self)
    }, TMP_Numeric_$$_6.$$arity = 0);
    Opal.defn(self, '$%', TMP_Numeric_$_7 = function(other) {
      var self = this;

      return $rb_minus(self, $rb_times(other, self.$div(other)))
    }, TMP_Numeric_$_7.$$arity = 1);
    Opal.defn(self, '$abs', TMP_Numeric_abs_8 = function $$abs() {
      var self = this;

      if ($rb_lt(self, 0)) {
        return self['$-@']()
        } else {
        return self
      }
    }, TMP_Numeric_abs_8.$$arity = 0);
    Opal.defn(self, '$abs2', TMP_Numeric_abs2_9 = function $$abs2() {
      var self = this;

      return $rb_times(self, self)
    }, TMP_Numeric_abs2_9.$$arity = 0);
    Opal.defn(self, '$angle', TMP_Numeric_angle_10 = function $$angle() {
      var self = this;

      if ($rb_lt(self, 0)) {
        return Opal.const_get([Opal.const_get($scopes, 'Math', true, true).$$scope], 'PI', true, true)
        } else {
        return 0
      }
    }, TMP_Numeric_angle_10.$$arity = 0);
    Opal.alias(self, "arg", "angle");
    Opal.defn(self, '$ceil', TMP_Numeric_ceil_11 = function $$ceil() {
      var self = this;

      return self.$to_f().$ceil()
    }, TMP_Numeric_ceil_11.$$arity = 0);
    Opal.defn(self, '$conj', TMP_Numeric_conj_12 = function $$conj() {
      var self = this;

      return self
    }, TMP_Numeric_conj_12.$$arity = 0);
    Opal.alias(self, "conjugate", "conj");
    Opal.defn(self, '$denominator', TMP_Numeric_denominator_13 = function $$denominator() {
      var self = this;

      return self.$to_r().$denominator()
    }, TMP_Numeric_denominator_13.$$arity = 0);
    Opal.defn(self, '$div', TMP_Numeric_div_14 = function $$div(other) {
      var self = this;

      
      if (other['$=='](0)) {
        self.$raise(Opal.const_get($scopes, 'ZeroDivisionError', true, true), "divided by o")};
      return $rb_divide(self, other).$floor();
    }, TMP_Numeric_div_14.$$arity = 1);
    Opal.defn(self, '$divmod', TMP_Numeric_divmod_15 = function $$divmod(other) {
      var self = this;

      return [self.$div(other), self['$%'](other)]
    }, TMP_Numeric_divmod_15.$$arity = 1);
    Opal.defn(self, '$fdiv', TMP_Numeric_fdiv_16 = function $$fdiv(other) {
      var self = this;

      return $rb_divide(self.$to_f(), other)
    }, TMP_Numeric_fdiv_16.$$arity = 1);
    Opal.defn(self, '$floor', TMP_Numeric_floor_17 = function $$floor() {
      var self = this;

      return self.$to_f().$floor()
    }, TMP_Numeric_floor_17.$$arity = 0);
    Opal.defn(self, '$i', TMP_Numeric_i_18 = function $$i() {
      var self = this;

      return self.$Complex(0, self)
    }, TMP_Numeric_i_18.$$arity = 0);
    Opal.defn(self, '$imag', TMP_Numeric_imag_19 = function $$imag() {
      var self = this;

      return 0
    }, TMP_Numeric_imag_19.$$arity = 0);
    Opal.alias(self, "imaginary", "imag");
    Opal.defn(self, '$integer?', TMP_Numeric_integer$q_20 = function() {
      var self = this;

      return false
    }, TMP_Numeric_integer$q_20.$$arity = 0);
    Opal.alias(self, "magnitude", "abs");
    Opal.alias(self, "modulo", "%");
    Opal.defn(self, '$nonzero?', TMP_Numeric_nonzero$q_21 = function() {
      var $a, self = this;

      if ((($a = self['$zero?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return self
      }
    }, TMP_Numeric_nonzero$q_21.$$arity = 0);
    Opal.defn(self, '$numerator', TMP_Numeric_numerator_22 = function $$numerator() {
      var self = this;

      return self.$to_r().$numerator()
    }, TMP_Numeric_numerator_22.$$arity = 0);
    Opal.alias(self, "phase", "arg");
    Opal.defn(self, '$polar', TMP_Numeric_polar_23 = function $$polar() {
      var self = this;

      return [self.$abs(), self.$arg()]
    }, TMP_Numeric_polar_23.$$arity = 0);
    Opal.defn(self, '$quo', TMP_Numeric_quo_24 = function $$quo(other) {
      var self = this;

      return $rb_divide(Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](self, Opal.const_get($scopes, 'Rational', true, true), "to_r"), other)
    }, TMP_Numeric_quo_24.$$arity = 1);
    Opal.defn(self, '$real', TMP_Numeric_real_25 = function $$real() {
      var self = this;

      return self
    }, TMP_Numeric_real_25.$$arity = 0);
    Opal.defn(self, '$real?', TMP_Numeric_real$q_26 = function() {
      var self = this;

      return true
    }, TMP_Numeric_real$q_26.$$arity = 0);
    Opal.defn(self, '$rect', TMP_Numeric_rect_27 = function $$rect() {
      var self = this;

      return [self, 0]
    }, TMP_Numeric_rect_27.$$arity = 0);
    Opal.alias(self, "rectangular", "rect");
    Opal.defn(self, '$round', TMP_Numeric_round_28 = function $$round(digits) {
      var self = this;

      return self.$to_f().$round(digits)
    }, TMP_Numeric_round_28.$$arity = -1);
    Opal.defn(self, '$to_c', TMP_Numeric_to_c_29 = function $$to_c() {
      var self = this;

      return self.$Complex(self, 0)
    }, TMP_Numeric_to_c_29.$$arity = 0);
    Opal.defn(self, '$to_int', TMP_Numeric_to_int_30 = function $$to_int() {
      var self = this;

      return self.$to_i()
    }, TMP_Numeric_to_int_30.$$arity = 0);
    Opal.defn(self, '$truncate', TMP_Numeric_truncate_31 = function $$truncate() {
      var self = this;

      return self.$to_f().$truncate()
    }, TMP_Numeric_truncate_31.$$arity = 0);
    Opal.defn(self, '$zero?', TMP_Numeric_zero$q_32 = function() {
      var self = this;

      return self['$=='](0)
    }, TMP_Numeric_zero$q_32.$$arity = 0);
    Opal.defn(self, '$positive?', TMP_Numeric_positive$q_33 = function() {
      var self = this;

      return $rb_gt(self, 0)
    }, TMP_Numeric_positive$q_33.$$arity = 0);
    Opal.defn(self, '$negative?', TMP_Numeric_negative$q_34 = function() {
      var self = this;

      return $rb_lt(self, 0)
    }, TMP_Numeric_negative$q_34.$$arity = 0);
    Opal.defn(self, '$dup', TMP_Numeric_dup_35 = function $$dup() {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't dup " + (self.$class()))
    }, TMP_Numeric_dup_35.$$arity = 0);
    return (Opal.defn(self, '$clone', TMP_Numeric_clone_36 = function $$clone() {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't clone " + (self.$class()))
    }, TMP_Numeric_clone_36.$$arity = 0), nil) && 'clone';
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/array"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $hash2 = Opal.hash2, $send = Opal.send, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$include', '$to_a', '$raise', '$replace', '$respond_to?', '$to_ary', '$coerce_to', '$coerce_to?', '$===', '$join', '$to_str', '$class', '$clone', '$hash', '$<=>', '$==', '$object_id', '$inspect', '$empty?', '$enum_for', '$bsearch_index', '$to_proc', '$coerce_to!', '$>', '$*', '$enumerator_size', '$size', '$[]', '$dig', '$eql?', '$length', '$begin', '$end', '$exclude_end?', '$flatten', '$__id__', '$to_s', '$new', '$!', '$>=', '$**', '$delete_if', '$each', '$reverse', '$rotate', '$rand', '$at', '$keep_if', '$shuffle!', '$dup', '$<', '$sort', '$sort_by', '$!=', '$times', '$[]=', '$<<', '$values', '$kind_of?', '$last', '$first', '$upto', '$reject', '$pristine']);
  
  self.$require("corelib/enumerable");
  self.$require("corelib/numeric");
  return (function($base, $super, $visibility_scopes) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Array_$$_1, TMP_Array_initialize_2, TMP_Array_try_convert_3, TMP_Array_$_4, TMP_Array_$_5, TMP_Array_$_6, TMP_Array_$_7, TMP_Array_$_8, TMP_Array_$lt$lt_9, TMP_Array_$lt$eq$gt_10, TMP_Array_$eq$eq_11, TMP_Array_$$_12, TMP_Array_$$$eq_13, TMP_Array_any$q_14, TMP_Array_assoc_15, TMP_Array_at_16, TMP_Array_bsearch_index_17, TMP_Array_bsearch_18, TMP_Array_cycle_19, TMP_Array_clear_21, TMP_Array_count_22, TMP_Array_initialize_copy_23, TMP_Array_collect_24, TMP_Array_collect$B_26, TMP_Array_combination_28, TMP_Array_repeated_combination_30, TMP_Array_compact_32, TMP_Array_compact$B_33, TMP_Array_concat_34, TMP_Array_delete_35, TMP_Array_delete_at_36, TMP_Array_delete_if_37, TMP_Array_dig_39, TMP_Array_drop_40, TMP_Array_dup_41, TMP_Array_each_42, TMP_Array_each_index_44, TMP_Array_empty$q_46, TMP_Array_eql$q_47, TMP_Array_fetch_48, TMP_Array_fill_49, TMP_Array_first_50, TMP_Array_flatten_51, TMP_Array_flatten$B_52, TMP_Array_hash_53, TMP_Array_include$q_54, TMP_Array_index_55, TMP_Array_insert_56, TMP_Array_inspect_57, TMP_Array_join_58, TMP_Array_keep_if_59, TMP_Array_last_61, TMP_Array_length_62, TMP_Array_permutation_63, TMP_Array_repeated_permutation_65, TMP_Array_pop_67, TMP_Array_product_68, TMP_Array_push_69, TMP_Array_rassoc_70, TMP_Array_reject_71, TMP_Array_reject$B_73, TMP_Array_replace_75, TMP_Array_reverse_76, TMP_Array_reverse$B_77, TMP_Array_reverse_each_78, TMP_Array_rindex_80, TMP_Array_rotate_81, TMP_Array_rotate$B_82, TMP_Array_sample_85, TMP_Array_select_86, TMP_Array_select$B_88, TMP_Array_shift_90, TMP_Array_shuffle_91, TMP_Array_shuffle$B_92, TMP_Array_slice$B_93, TMP_Array_sort_94, TMP_Array_sort$B_95, TMP_Array_sort_by$B_96, TMP_Array_take_98, TMP_Array_take_while_99, TMP_Array_to_a_100, TMP_Array_to_h_101, TMP_Array_transpose_104, TMP_Array_uniq_105, TMP_Array_uniq$B_106, TMP_Array_unshift_107, TMP_Array_values_at_110, TMP_Array_zip_111, TMP_Array_inherited_112, TMP_Array_instance_variables_113;

    def.length = nil;
    
    self.$include(Opal.const_get($scopes, 'Enumerable', true, true));
    def.$$is_array = true;
    
    function toArraySubclass(obj, klass) {
      if (klass.$$name === Opal.Array) {
        return obj;
      } else {
        return klass.$allocate().$replace((obj).$to_a());
      }
    }
  ;
    Opal.defs(self, '$[]', TMP_Array_$$_1 = function($a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 0] = arguments[$arg_idx];
      }
      return toArraySubclass(objects, self)
    }, TMP_Array_$$_1.$$arity = -1);
    Opal.defn(self, '$initialize', TMP_Array_initialize_2 = function $$initialize(size, obj) {
      var self = this, $iter = TMP_Array_initialize_2.$$p, block = $iter || nil;

      if (size == null) {
        size = nil;
      }
      if (obj == null) {
        obj = nil;
      }
      TMP_Array_initialize_2.$$p = null;
      
      if (size > Opal.const_get([Opal.const_get($scopes, 'Integer', true, true).$$scope], 'MAX', true, true)) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "array size too big")
      }

      if (arguments.length > 2) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (arguments.length) + " for 0..2)")
      }

      if (arguments.length === 0) {
        self.splice(0, self.length);
        return self;
      }

      if (arguments.length === 1) {
        if (size.$$is_array) {
          self.$replace(size.$to_a())
          return self;
        } else if (size['$respond_to?']("to_ary")) {
          self.$replace(size.$to_ary())
          return self;
        }
      }

      size = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(size, Opal.const_get($scopes, 'Integer', true, true), "to_int")

      if (size < 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "negative array size")
      }

      self.splice(0, self.length);
      var i, value;

      if (block === nil) {
        for (i = 0; i < size; i++) {
          self.push(obj);
        }
      }
      else {
        for (i = 0, value; i < size; i++) {
          value = block(i);
          self[i] = value;
        }
      }

      return self;
    
    }, TMP_Array_initialize_2.$$arity = -1);
    Opal.defs(self, '$try_convert', TMP_Array_try_convert_3 = function $$try_convert(obj) {
      var self = this;

      return Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](obj, Opal.const_get($scopes, 'Array', true, true), "to_ary")
    }, TMP_Array_try_convert_3.$$arity = 1);
    Opal.defn(self, '$&', TMP_Array_$_4 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'Array', true, true), "to_ary").$to_a()
      };
      
      var result = [], hash = $hash2([], {}), i, length, item;

      for (i = 0, length = other.length; i < length; i++) {
        Opal.hash_put(hash, other[i], true);
      }

      for (i = 0, length = self.length; i < length; i++) {
        item = self[i];
        if (Opal.hash_delete(hash, item) !== undefined) {
          result.push(item);
        }
      }

      return result;
    ;
    }, TMP_Array_$_4.$$arity = 1);
    Opal.defn(self, '$|', TMP_Array_$_5 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'Array', true, true), "to_ary").$to_a()
      };
      
      var hash = $hash2([], {}), i, length, item;

      for (i = 0, length = self.length; i < length; i++) {
        Opal.hash_put(hash, self[i], true);
      }

      for (i = 0, length = other.length; i < length; i++) {
        Opal.hash_put(hash, other[i], true);
      }

      return hash.$keys();
    ;
    }, TMP_Array_$_5.$$arity = 1);
    Opal.defn(self, '$*', TMP_Array_$_6 = function(other) {
      var $a, self = this;

      
      if ((($a = other['$respond_to?']("to_str")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$join(other.$to_str())};
      other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      if ((($a = other < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "negative argument")};
      
      var result = [],
          converted = self.$to_a();

      for (var i = 0; i < other; i++) {
        result = result.concat(converted);
      }

      return toArraySubclass(result, self.$class());
    ;
    }, TMP_Array_$_6.$$arity = 1);
    Opal.defn(self, '$+', TMP_Array_$_7 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'Array', true, true), "to_ary").$to_a()
      };
      return self.concat(other);
    }, TMP_Array_$_7.$$arity = 1);
    Opal.defn(self, '$-', TMP_Array_$_8 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'Array', true, true), "to_ary").$to_a()
      };
      if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return []};
      if ((($a = other.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$clone().$to_a()};
      
      var result = [], hash = $hash2([], {}), i, length, item;

      for (i = 0, length = other.length; i < length; i++) {
        Opal.hash_put(hash, other[i], true);
      }

      for (i = 0, length = self.length; i < length; i++) {
        item = self[i];
        if (Opal.hash_get(hash, item) === undefined) {
          result.push(item);
        }
      }

      return result;
    ;
    }, TMP_Array_$_8.$$arity = 1);
    Opal.defn(self, '$<<', TMP_Array_$lt$lt_9 = function(object) {
      var self = this;

      
      self.push(object);;
      return self;
    }, TMP_Array_$lt$lt_9.$$arity = 1);
    Opal.defn(self, '$<=>', TMP_Array_$lt$eq$gt_10 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
      } else if ((($a = other['$respond_to?']("to_ary")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_ary().$to_a()
        } else {
        return nil
      };
      
      if (self.$hash() === other.$hash()) {
        return 0;
      }

      var count = Math.min(self.length, other.length);

      for (var i = 0; i < count; i++) {
        var tmp = (self[i])['$<=>'](other[i]);

        if (tmp !== 0) {
          return tmp;
        }
      }

      return (self.length)['$<=>'](other.length);
    ;
    }, TMP_Array_$lt$eq$gt_10.$$arity = 1);
    Opal.defn(self, '$==', TMP_Array_$eq$eq_11 = function(other) {
      var self = this;

      
      var recursed = {};

      function _eqeq(array, other) {
        var i, length, a, b;

        if (array === other)
          return true;

        if (!other.$$is_array) {
          if (Opal.const_get($scopes, 'Opal', true, true)['$respond_to?'](other, "to_ary")) {
            return (other)['$=='](array);
          } else {
            return false;
          }
        }

        if (array.constructor !== Array)
          array = (array).$to_a();
        if (other.constructor !== Array)
          other = (other).$to_a();

        if (array.length !== other.length) {
          return false;
        }

        recursed[(array).$object_id()] = true;

        for (i = 0, length = array.length; i < length; i++) {
          a = array[i];
          b = other[i];
          if (a.$$is_array) {
            if (b.$$is_array && b.length !== a.length) {
              return false;
            }
            if (!recursed.hasOwnProperty((a).$object_id())) {
              if (!_eqeq(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$=='](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eqeq(self, other);
    
    }, TMP_Array_$eq$eq_11.$$arity = 1);
    Opal.defn(self, '$[]', TMP_Array_$$_12 = function(index, length) {
      var self = this;

      
      var size = self.length,
          exclude, from, to, result;

      if (index.$$is_range) {
        exclude = index.exclude;
        from    = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index.begin, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        to      = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index.end, Opal.const_get($scopes, 'Integer', true, true), "to_int");

        if (from < 0) {
          from += size;

          if (from < 0) {
            return nil;
          }
        }

        if (from > size) {
          return nil;
        }

        if (to < 0) {
          to += size;

          if (to < 0) {
            return [];
          }
        }

        if (!exclude) {
          to += 1;
        }

        result = self.slice(from, to)
      }
      else {
        index = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index, Opal.const_get($scopes, 'Integer', true, true), "to_int");

        if (index < 0) {
          index += size;

          if (index < 0) {
            return nil;
          }
        }

        if (length === undefined) {
          if (index >= size || index < 0) {
            return nil;
          }

          return self[index];
        }
        else {
          length = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(length, Opal.const_get($scopes, 'Integer', true, true), "to_int");

          if (length < 0 || index > size || index < 0) {
            return nil;
          }

          result = self.slice(index, index + length);
        }
      }

      return toArraySubclass(result, self.$class())
    
    }, TMP_Array_$$_12.$$arity = -2);
    Opal.defn(self, '$[]=', TMP_Array_$$$eq_13 = function(index, value, extra) {
      var $a, self = this, data = nil, length = nil;

      
      
      var i, size = self.length;
    ;
      if ((($a = Opal.const_get($scopes, 'Range', true, true)['$==='](index)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](value)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          data = value.$to_a()
        } else if ((($a = value['$respond_to?']("to_ary")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          data = value.$to_ary().$to_a()
          } else {
          data = [value]
        };
        
        var exclude = index.exclude,
            from    = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index.begin, Opal.const_get($scopes, 'Integer', true, true), "to_int"),
            to      = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index.end, Opal.const_get($scopes, 'Integer', true, true), "to_int");

        if (from < 0) {
          from += size;

          if (from < 0) {
            self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "" + (index.$inspect()) + " out of range");
          }
        }

        if (to < 0) {
          to += size;
        }

        if (!exclude) {
          to += 1;
        }

        if (from > size) {
          for (i = size; i < from; i++) {
            self[i] = nil;
          }
        }

        if (to < 0) {
          self.splice.apply(self, [from, 0].concat(data));
        }
        else {
          self.splice.apply(self, [from, to - from].concat(data));
        }

        return value;
      ;
        } else {
        
        if ((($a = extra === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          length = 1
          } else {
          
          length = value;
          value = extra;
          if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](value)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            data = value.$to_a()
          } else if ((($a = value['$respond_to?']("to_ary")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            data = value.$to_ary().$to_a()
            } else {
            data = [value]
          };
        };
        
        var old;

        index  = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        length = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(length, Opal.const_get($scopes, 'Integer', true, true), "to_int");

        if (index < 0) {
          old    = index;
          index += size;

          if (index < 0) {
            self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + "index " + (old) + " too small for array; minimum " + (-self.length));
          }
        }

        if (length < 0) {
          self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + "negative length (" + (length) + ")")
        }

        if (index > size) {
          for (i = size; i < index; i++) {
            self[i] = nil;
          }
        }

        if (extra === undefined) {
          self[index] = value;
        }
        else {
          self.splice.apply(self, [index, length].concat(data));
        }

        return value;
      ;
      };
    }, TMP_Array_$$$eq_13.$$arity = -3);
    Opal.defn(self, '$any?', TMP_Array_any$q_14 = function() {
      var $a, self = this, $iter = TMP_Array_any$q_14.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Array_any$q_14.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      if ((($a = self['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return false
        } else {
        return $send(self, Opal.find_super_dispatcher(self, 'any?', TMP_Array_any$q_14, false), $zuper, $iter)
      }
    }, TMP_Array_any$q_14.$$arity = 0);
    Opal.defn(self, '$assoc', TMP_Array_assoc_15 = function $$assoc(object) {
      var self = this;

      
      for (var i = 0, length = self.length, item; i < length; i++) {
        if (item = self[i], item.length && (item[0])['$=='](object)) {
          return item;
        }
      }

      return nil;
    
    }, TMP_Array_assoc_15.$$arity = 1);
    Opal.defn(self, '$at', TMP_Array_at_16 = function $$at(index) {
      var self = this;

      
      index = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      
      if (index < 0) {
        index += self.length;
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      return self[index];
    ;
    }, TMP_Array_at_16.$$arity = 1);
    Opal.defn(self, '$bsearch_index', TMP_Array_bsearch_index_17 = function $$bsearch_index() {
      var self = this, $iter = TMP_Array_bsearch_index_17.$$p, block = $iter || nil;

      TMP_Array_bsearch_index_17.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return self.$enum_for("bsearch_index")
      };
      
      var min = 0,
          max = self.length,
          mid,
          val,
          ret,
          smaller = false,
          satisfied = nil;

      while (min < max) {
        mid = min + Math.floor((max - min) / 2);
        val = self[mid];
        ret = Opal.yield1(block, val);

        if (ret === true) {
          satisfied = mid;
          smaller = true;
        }
        else if (ret === false || ret === nil) {
          smaller = false;
        }
        else if (ret.$$is_number) {
          if (ret === 0) { return mid; }
          smaller = (ret < 0);
        }
        else {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "wrong argument type " + ((ret).$class()) + " (must be numeric, true, false or nil)")
        }

        if (smaller) { max = mid; } else { min = mid + 1; }
      }

      return satisfied;
    ;
    }, TMP_Array_bsearch_index_17.$$arity = 0);
    Opal.defn(self, '$bsearch', TMP_Array_bsearch_18 = function $$bsearch() {
      var self = this, $iter = TMP_Array_bsearch_18.$$p, block = $iter || nil, index = nil;

      TMP_Array_bsearch_18.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return self.$enum_for("bsearch")
      };
      index = $send(self, 'bsearch_index', [], block.$to_proc());
      
      if (index != null && index.$$is_number) {
        return self[index];
      } else {
        return index;
      }
    ;
    }, TMP_Array_bsearch_18.$$arity = 0);
    Opal.defn(self, '$cycle', TMP_Array_cycle_19 = function $$cycle(n) {
      var TMP_20, $a, $b, self = this, $iter = TMP_Array_cycle_19.$$p, block = $iter || nil;

      if (n == null) {
        n = nil;
      }
      TMP_Array_cycle_19.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["cycle", n], (TMP_20 = function(){var self = TMP_20.$$s || this, $a;

        if (n['$=='](nil)) {
            return Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'INFINITY', true, true)
            } else {
            
            n = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
            if ((($a = $rb_gt(n, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
              return $rb_times(self.$enumerator_size(), n)
              } else {
              return 0
            };
          }}, TMP_20.$$s = self, TMP_20.$$arity = 0, TMP_20))
      };
      if ((($a = ((($b = self['$empty?']()) !== false && $b !== nil && $b != null) ? $b : n['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil};
      
      var i, length, value;

      if (n === nil) {
        while (true) {
          for (i = 0, length = self.length; i < length; i++) {
            value = Opal.yield1(block, self[i]);
          }
        }
      }
      else {
        n = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if (n <= 0) {
          return self;
        }

        while (n > 0) {
          for (i = 0, length = self.length; i < length; i++) {
            value = Opal.yield1(block, self[i]);
          }

          n--;
        }
      }
    ;
      return self;
    }, TMP_Array_cycle_19.$$arity = -1);
    Opal.defn(self, '$clear', TMP_Array_clear_21 = function $$clear() {
      var self = this;

      
      self.splice(0, self.length);
      return self;
    }, TMP_Array_clear_21.$$arity = 0);
    Opal.defn(self, '$count', TMP_Array_count_22 = function $$count(object) {
      var $a, $b, self = this, $iter = TMP_Array_count_22.$$p, block = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      if (object == null) {
        object = nil;
      }
      TMP_Array_count_22.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      if ((($a = ((($b = object) !== false && $b !== nil && $b != null) ? $b : block)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $send(self, Opal.find_super_dispatcher(self, 'count', TMP_Array_count_22, false), $zuper, $iter)
        } else {
        return self.$size()
      }
    }, TMP_Array_count_22.$$arity = -1);
    Opal.defn(self, '$initialize_copy', TMP_Array_initialize_copy_23 = function $$initialize_copy(other) {
      var self = this;

      return self.$replace(other)
    }, TMP_Array_initialize_copy_23.$$arity = 1);
    Opal.defn(self, '$collect', TMP_Array_collect_24 = function $$collect() {
      var TMP_25, self = this, $iter = TMP_Array_collect_24.$$p, block = $iter || nil;

      TMP_Array_collect_24.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["collect"], (TMP_25 = function(){var self = TMP_25.$$s || this;

        return self.$size()}, TMP_25.$$s = self, TMP_25.$$arity = 0, TMP_25))
      };
      
      var result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self[i]);
        result.push(value);
      }

      return result;
    ;
    }, TMP_Array_collect_24.$$arity = 0);
    Opal.defn(self, '$collect!', TMP_Array_collect$B_26 = function() {
      var TMP_27, self = this, $iter = TMP_Array_collect$B_26.$$p, block = $iter || nil;

      TMP_Array_collect$B_26.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["collect!"], (TMP_27 = function(){var self = TMP_27.$$s || this;

        return self.$size()}, TMP_27.$$s = self, TMP_27.$$arity = 0, TMP_27))
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self[i]);
        self[i] = value;
      }
    ;
      return self;
    }, TMP_Array_collect$B_26.$$arity = 0);
    
    function binomial_coefficient(n, k) {
      if (n === k || k === 0) {
        return 1;
      }

      if (k > 0 && n > k) {
        return binomial_coefficient(n - 1, k - 1) + binomial_coefficient(n - 1, k);
      }

      return 0;
    }
  ;
    Opal.defn(self, '$combination', TMP_Array_combination_28 = function $$combination(n) {
      var TMP_29, self = this, $iter = TMP_Array_combination_28.$$p, $yield = $iter || nil, num = nil;

      TMP_Array_combination_28.$$p = null;
      
      num = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      if (($yield !== nil)) {
        } else {
        return $send(self, 'enum_for', ["combination", num], (TMP_29 = function(){var self = TMP_29.$$s || this;

        return binomial_coefficient(self.length, num)}, TMP_29.$$s = self, TMP_29.$$arity = 0, TMP_29))
      };
      
      var i, length, stack, chosen, lev, done, next;

      if (num === 0) {
        Opal.yield1($yield, [])
      } else if (num === 1) {
        for (i = 0, length = self.length; i < length; i++) {
          Opal.yield1($yield, [self[i]])
        }
      }
      else if (num === self.length) {
        Opal.yield1($yield, self.slice())
      }
      else if (num >= 0 && num < self.length) {
        stack = [];
        for (i = 0; i <= num + 1; i++) {
          stack.push(0);
        }

        chosen = [];
        lev = 0;
        done = false;
        stack[0] = -1;

        while (!done) {
          chosen[lev] = self[stack[lev+1]];
          while (lev < num - 1) {
            lev++;
            next = stack[lev+1] = stack[lev] + 1;
            chosen[lev] = self[next];
          }
          Opal.yield1($yield, chosen.slice())
          lev++;
          do {
            done = (lev === 0);
            stack[lev]++;
            lev--;
          } while ( stack[lev+1] + num === self.length + lev + 1 );
        }
      }
    ;
      return self;
    }, TMP_Array_combination_28.$$arity = 1);
    Opal.defn(self, '$repeated_combination', TMP_Array_repeated_combination_30 = function $$repeated_combination(n) {
      var TMP_31, self = this, $iter = TMP_Array_repeated_combination_30.$$p, $yield = $iter || nil, num = nil;

      TMP_Array_repeated_combination_30.$$p = null;
      
      num = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      if (($yield !== nil)) {
        } else {
        return $send(self, 'enum_for', ["repeated_combination", num], (TMP_31 = function(){var self = TMP_31.$$s || this;

        return binomial_coefficient(self.length + num - 1, num)}, TMP_31.$$s = self, TMP_31.$$arity = 0, TMP_31))
      };
      
      function iterate(max, from, buffer, self) {
        if (buffer.length == max) {
          var copy = buffer.slice();
          Opal.yield1($yield, copy)
          return;
        }
        for (var i = from; i < self.length; i++) {
          buffer.push(self[i]);
          iterate(max, i, buffer, self);
          buffer.pop();
        }
      }

      if (num >= 0) {
        iterate(num, 0, [], self);
      }
    ;
      return self;
    }, TMP_Array_repeated_combination_30.$$arity = 1);
    Opal.defn(self, '$compact', TMP_Array_compact_32 = function $$compact() {
      var self = this;

      
      var result = [];

      for (var i = 0, length = self.length, item; i < length; i++) {
        if ((item = self[i]) !== nil) {
          result.push(item);
        }
      }

      return result;
    
    }, TMP_Array_compact_32.$$arity = 0);
    Opal.defn(self, '$compact!', TMP_Array_compact$B_33 = function() {
      var self = this;

      
      var original = self.length;

      for (var i = 0, length = self.length; i < length; i++) {
        if (self[i] === nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }

      return self.length === original ? nil : self;
    
    }, TMP_Array_compact$B_33.$$arity = 0);
    Opal.defn(self, '$concat', TMP_Array_concat_34 = function $$concat(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'Array', true, true), "to_ary").$to_a()
      };
      
      for (var i = 0, length = other.length; i < length; i++) {
        self.push(other[i]);
      }
    ;
      return self;
    }, TMP_Array_concat_34.$$arity = 1);
    Opal.defn(self, '$delete', TMP_Array_delete_35 = function(object) {
      var self = this, $iter = TMP_Array_delete_35.$$p, $yield = $iter || nil;

      TMP_Array_delete_35.$$p = null;
      
      var original = self.length;

      for (var i = 0, length = original; i < length; i++) {
        if ((self[i])['$=='](object)) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }

      if (self.length === original) {
        if (($yield !== nil)) {
          return Opal.yieldX($yield, []);
        }
        return nil;
      }
      return object;
    
    }, TMP_Array_delete_35.$$arity = 1);
    Opal.defn(self, '$delete_at', TMP_Array_delete_at_36 = function $$delete_at(index) {
      var self = this;

      
      index = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      if (index < 0) {
        index += self.length;
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      var result = self[index];

      self.splice(index, 1);

      return result;
    
    }, TMP_Array_delete_at_36.$$arity = 1);
    Opal.defn(self, '$delete_if', TMP_Array_delete_if_37 = function $$delete_if() {
      var TMP_38, self = this, $iter = TMP_Array_delete_if_37.$$p, block = $iter || nil;

      TMP_Array_delete_if_37.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["delete_if"], (TMP_38 = function(){var self = TMP_38.$$s || this;

        return self.$size()}, TMP_38.$$s = self, TMP_38.$$arity = 0, TMP_38))
      };
      
      for (var i = 0, length = self.length, value; i < length; i++) {
        value = block(self[i]);

        if (value !== false && value !== nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }
    ;
      return self;
    }, TMP_Array_delete_if_37.$$arity = 0);
    Opal.defn(self, '$dig', TMP_Array_dig_39 = function $$dig(idx, $a_rest) {
      var $b, self = this, idxs, item = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      idxs = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        idxs[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      item = self['$[]'](idx);
      
      if (item === nil || idxs.length === 0) {
        return item;
      }
    ;
      if ((($b = item['$respond_to?']("dig")) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + (item.$class()) + " does not have #dig method")
      };
      return $send(item, 'dig', Opal.to_a(idxs));
    }, TMP_Array_dig_39.$$arity = -2);
    Opal.defn(self, '$drop', TMP_Array_drop_40 = function $$drop(number) {
      var self = this;

      
      if (number < 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true))
      }

      return self.slice(number);
    
    }, TMP_Array_drop_40.$$arity = 1);
    Opal.defn(self, '$dup', TMP_Array_dup_41 = function $$dup() {
      var self = this, $iter = TMP_Array_dup_41.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Array_dup_41.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      
      
      if (
        self.$$class === Opal.Array &&
        self.$allocate.$$pristine &&
        self.$copy_instance_variables.$$pristine &&
        self.$initialize_dup.$$pristine
      ) return self.slice(0);
    ;
      return $send(self, Opal.find_super_dispatcher(self, 'dup', TMP_Array_dup_41, false), $zuper, $iter);
    }, TMP_Array_dup_41.$$arity = 0);
    Opal.defn(self, '$each', TMP_Array_each_42 = function $$each() {
      var TMP_43, self = this, $iter = TMP_Array_each_42.$$p, block = $iter || nil;

      TMP_Array_each_42.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["each"], (TMP_43 = function(){var self = TMP_43.$$s || this;

        return self.$size()}, TMP_43.$$s = self, TMP_43.$$arity = 0, TMP_43))
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, self[i]);
      }
    ;
      return self;
    }, TMP_Array_each_42.$$arity = 0);
    Opal.defn(self, '$each_index', TMP_Array_each_index_44 = function $$each_index() {
      var TMP_45, self = this, $iter = TMP_Array_each_index_44.$$p, block = $iter || nil;

      TMP_Array_each_index_44.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["each_index"], (TMP_45 = function(){var self = TMP_45.$$s || this;

        return self.$size()}, TMP_45.$$s = self, TMP_45.$$arity = 0, TMP_45))
      };
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.yield1(block, i);
      }
    ;
      return self;
    }, TMP_Array_each_index_44.$$arity = 0);
    Opal.defn(self, '$empty?', TMP_Array_empty$q_46 = function() {
      var self = this;

      return self.length === 0
    }, TMP_Array_empty$q_46.$$arity = 0);
    Opal.defn(self, '$eql?', TMP_Array_eql$q_47 = function(other) {
      var self = this;

      
      var recursed = {};

      function _eql(array, other) {
        var i, length, a, b;

        if (!other.$$is_array) {
          return false;
        }

        other = other.$to_a();

        if (array.length !== other.length) {
          return false;
        }

        recursed[(array).$object_id()] = true;

        for (i = 0, length = array.length; i < length; i++) {
          a = array[i];
          b = other[i];
          if (a.$$is_array) {
            if (b.$$is_array && b.length !== a.length) {
              return false;
            }
            if (!recursed.hasOwnProperty((a).$object_id())) {
              if (!_eql(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$eql?'](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eql(self, other);
    
    }, TMP_Array_eql$q_47.$$arity = 1);
    Opal.defn(self, '$fetch', TMP_Array_fetch_48 = function $$fetch(index, defaults) {
      var self = this, $iter = TMP_Array_fetch_48.$$p, block = $iter || nil;

      TMP_Array_fetch_48.$$p = null;
      
      var original = index;

      index = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      if (index < 0) {
        index += self.length;
      }

      if (index >= 0 && index < self.length) {
        return self[index];
      }

      if (block !== nil) {
        return block(original);
      }

      if (defaults != null) {
        return defaults;
      }

      if (self.length === 0) {
        self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + "index " + (original) + " outside of array bounds: 0...0")
      }
      else {
        self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + "index " + (original) + " outside of array bounds: -" + (self.length) + "..." + (self.length));
      }
    
    }, TMP_Array_fetch_48.$$arity = -2);
    Opal.defn(self, '$fill', TMP_Array_fill_49 = function $$fill($a_rest) {
      var $b, $c, self = this, args, $iter = TMP_Array_fill_49.$$p, block = $iter || nil, one = nil, two = nil, obj = nil, left = nil, right = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Array_fill_49.$$p = null;
      
      
      var i, length, value;
    ;
      if (block !== false && block !== nil && block != null) {
        
        if ((($b = args.length > 2) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (args.$length()) + " for 0..2)")};
        $c = args, $b = Opal.to_ary($c), (one = ($b[0] == null ? nil : $b[0])), (two = ($b[1] == null ? nil : $b[1])), $c;
        } else {
        
        if ((($b = args.length == 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "wrong number of arguments (0 for 1..3)")
        } else if ((($b = args.length > 3) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (args.$length()) + " for 1..3)")};
        $c = args, $b = Opal.to_ary($c), (obj = ($b[0] == null ? nil : $b[0])), (one = ($b[1] == null ? nil : $b[1])), (two = ($b[2] == null ? nil : $b[2])), $c;
      };
      if ((($b = Opal.const_get($scopes, 'Range', true, true)['$==='](one)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        
        if (two !== false && two !== nil && two != null) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "length invalid with range")};
        left = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(one.$begin(), Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($b = left < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          left += self.length};
        if ((($b = left < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "" + (one.$inspect()) + " out of range")};
        right = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(one.$end(), Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($b = right < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          right += self.length};
        if ((($b = one['$exclude_end?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          } else {
          right += 1
        };
        if ((($b = right <= left) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return self};
      } else if (one !== false && one !== nil && one != null) {
        
        left = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(one, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($b = left < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          left += self.length};
        if ((($b = left < 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          left = 0};
        if (two !== false && two !== nil && two != null) {
          
          right = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(two, Opal.const_get($scopes, 'Integer', true, true), "to_int");
          if ((($b = right == 0) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            return self};
          right += left;
          } else {
          right = self.length
        };
        } else {
        
        left = 0;
        right = self.length;
      };
      if ((($b = left > self.length) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        
        for (i = self.length; i < right; i++) {
          self[i] = nil;
        }
      };
      if ((($b = right > self.length) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.length = right};
      if (block !== false && block !== nil && block != null) {
        
        for (length = self.length; left < right; left++) {
          value = block(left);
          self[left] = value;
        }
      
        } else {
        
        for (length = self.length; left < right; left++) {
          self[left] = obj;
        }
      
      };
      return self;
    }, TMP_Array_fill_49.$$arity = -1);
    Opal.defn(self, '$first', TMP_Array_first_50 = function $$first(count) {
      var self = this;

      
      if (count == null) {
        return self.length === 0 ? nil : self[0];
      }

      count = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(count, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      if (count < 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "negative array size");
      }

      return self.slice(0, count);
    
    }, TMP_Array_first_50.$$arity = -1);
    Opal.defn(self, '$flatten', TMP_Array_flatten_51 = function $$flatten(level) {
      var self = this;

      
      function _flatten(array, level) {
        var result = [],
            i, length,
            item, ary;

        array = (array).$to_a();

        for (i = 0, length = array.length; i < length; i++) {
          item = array[i];

          if (!Opal.const_get($scopes, 'Opal', true, true)['$respond_to?'](item, "to_ary")) {
            result.push(item);
            continue;
          }

          ary = (item).$to_ary();

          if (ary === nil) {
            result.push(item);
            continue;
          }

          if (!ary.$$is_array) {
            self.$raise(Opal.const_get($scopes, 'TypeError', true, true));
          }

          if (ary === self) {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true));
          }

          switch (level) {
          case undefined:
            result = result.concat(_flatten(ary));
            break;
          case 0:
            result.push(ary);
            break;
          default:
            result.push.apply(result, _flatten(ary, level - 1));
          }
        }
        return result;
      }

      if (level !== undefined) {
        level = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(level, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }

      return toArraySubclass(_flatten(self, level), self.$class());
    
    }, TMP_Array_flatten_51.$$arity = -1);
    Opal.defn(self, '$flatten!', TMP_Array_flatten$B_52 = function(level) {
      var self = this;

      
      
      var flattened = self.$flatten(level);

      if (self.length == flattened.length) {
        for (var i = 0, length = self.length; i < length; i++) {
          if (self[i] !== flattened[i]) {
            break;
          }
        }

        if (i == length) {
          return nil;
        }
      }

      self.$replace(flattened);
    ;
      return self;
    }, TMP_Array_flatten$B_52.$$arity = -1);
    Opal.defn(self, '$hash', TMP_Array_hash_53 = function $$hash() {
      var self = this;

      
      var top = (Opal.hash_ids == undefined),
          result = ['A'],
          hash_id = self.$object_id(),
          item, i, key;

      try {
        if (top) {
          Opal.hash_ids = {};
        }

        if (Opal.hash_ids.hasOwnProperty(hash_id)) {
          return 'self';
        }

        for (key in Opal.hash_ids) {
          if (Opal.hash_ids.hasOwnProperty(key)) {
            item = Opal.hash_ids[key];
            if (self['$eql?'](item)) {
              return 'self';
            }
          }
        }

        Opal.hash_ids[hash_id] = self;

        for (i = 0; i < self.length; i++) {
          item = self[i];
          result.push(item.$hash());
        }

        return result.join(',');
      } finally {
        if (top) {
          delete Opal.hash_ids;
        }
      }
    
    }, TMP_Array_hash_53.$$arity = 0);
    Opal.defn(self, '$include?', TMP_Array_include$q_54 = function(member) {
      var self = this;

      
      for (var i = 0, length = self.length; i < length; i++) {
        if ((self[i])['$=='](member)) {
          return true;
        }
      }

      return false;
    
    }, TMP_Array_include$q_54.$$arity = 1);
    Opal.defn(self, '$index', TMP_Array_index_55 = function $$index(object) {
      var self = this, $iter = TMP_Array_index_55.$$p, block = $iter || nil;

      TMP_Array_index_55.$$p = null;
      
      var i, length, value;

      if (object != null) {
        for (i = 0, length = self.length; i < length; i++) {
          if ((self[i])['$=='](object)) {
            return i;
          }
        }
      }
      else if (block !== nil) {
        for (i = 0, length = self.length; i < length; i++) {
          value = block(self[i]);

          if (value !== false && value !== nil) {
            return i;
          }
        }
      }
      else {
        return self.$enum_for("index");
      }

      return nil;
    
    }, TMP_Array_index_55.$$arity = -1);
    Opal.defn(self, '$insert', TMP_Array_insert_56 = function $$insert(index, $a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      
      index = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      if (objects.length > 0) {
        if (index < 0) {
          index += self.length + 1;

          if (index < 0) {
            self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + (index) + " is out of bounds");
          }
        }
        if (index > self.length) {
          for (var i = self.length; i < index; i++) {
            self.push(nil);
          }
        }

        self.splice.apply(self, [index, 0].concat(objects));
      }
    ;
      return self;
    }, TMP_Array_insert_56.$$arity = -2);
    Opal.defn(self, '$inspect', TMP_Array_inspect_57 = function $$inspect() {
      var self = this;

      
      var result = [],
          id     = self.$__id__();

      for (var i = 0, length = self.length; i < length; i++) {
        var item = self['$[]'](i);

        if ((item).$__id__() === id) {
          result.push('[...]');
        }
        else {
          result.push((item).$inspect());
        }
      }

      return '[' + result.join(', ') + ']';
    
    }, TMP_Array_inspect_57.$$arity = 0);
    Opal.defn(self, '$join', TMP_Array_join_58 = function $$join(sep) {
      var $a, self = this;
      if ($gvars[","] == null) $gvars[","] = nil;

      if (sep == null) {
        sep = nil;
      }
      
      if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return ""};
      if ((($a = sep === nil) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        sep = $gvars[","]};
      
      var result = [];
      var i, length, item, tmp;

      for (i = 0, length = self.length; i < length; i++) {
        item = self[i];

        if (Opal.const_get($scopes, 'Opal', true, true)['$respond_to?'](item, "to_str")) {
          tmp = (item).$to_str();

          if (tmp !== nil) {
            result.push((tmp).$to_s());

            continue;
          }
        }

        if (Opal.const_get($scopes, 'Opal', true, true)['$respond_to?'](item, "to_ary")) {
          tmp = (item).$to_ary();

          if (tmp === self) {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true));
          }

          if (tmp !== nil) {
            result.push((tmp).$join(sep));

            continue;
          }
        }

        if (Opal.const_get($scopes, 'Opal', true, true)['$respond_to?'](item, "to_s")) {
          tmp = (item).$to_s();

          if (tmp !== nil) {
            result.push(tmp);

            continue;
          }
        }

        self.$raise(Opal.const_get($scopes, 'NoMethodError', true, true).$new("" + (Opal.const_get($scopes, 'Opal', true, true).$inspect(item)) + " doesn't respond to #to_str, #to_ary or #to_s", "to_str"));
      }

      if (sep === nil) {
        return result.join('');
      }
      else {
        return result.join(Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](sep, Opal.const_get($scopes, 'String', true, true), "to_str").$to_s());
      }
    ;
    }, TMP_Array_join_58.$$arity = -1);
    Opal.defn(self, '$keep_if', TMP_Array_keep_if_59 = function $$keep_if() {
      var TMP_60, self = this, $iter = TMP_Array_keep_if_59.$$p, block = $iter || nil;

      TMP_Array_keep_if_59.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["keep_if"], (TMP_60 = function(){var self = TMP_60.$$s || this;

        return self.$size()}, TMP_60.$$s = self, TMP_60.$$arity = 0, TMP_60))
      };
      
      for (var i = 0, length = self.length, value; i < length; i++) {
        value = block(self[i]);

        if (value === false || value === nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }
    ;
      return self;
    }, TMP_Array_keep_if_59.$$arity = 0);
    Opal.defn(self, '$last', TMP_Array_last_61 = function $$last(count) {
      var self = this;

      
      if (count == null) {
        return self.length === 0 ? nil : self[self.length - 1];
      }

      count = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(count, Opal.const_get($scopes, 'Integer', true, true), "to_int");

      if (count < 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "negative array size");
      }

      if (count > self.length) {
        count = self.length;
      }

      return self.slice(self.length - count, self.length);
    
    }, TMP_Array_last_61.$$arity = -1);
    Opal.defn(self, '$length', TMP_Array_length_62 = function $$length() {
      var self = this;

      return self.length
    }, TMP_Array_length_62.$$arity = 0);
    Opal.alias(self, "map", "collect");
    Opal.alias(self, "map!", "collect!");
    
    // Returns the product of from, from-1, ..., from - how_many + 1.
    function descending_factorial(from, how_many) {
      var count = how_many >= 0 ? 1 : 0;
      while (how_many) {
        count *= from;
        from--;
        how_many--;
      }
      return count;
    }
  ;
    Opal.defn(self, '$permutation', TMP_Array_permutation_63 = function $$permutation(num) {
      var TMP_64, self = this, $iter = TMP_Array_permutation_63.$$p, block = $iter || nil, perm = nil, used = nil;

      TMP_Array_permutation_63.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["permutation", num], (TMP_64 = function(){var self = TMP_64.$$s || this;

        return descending_factorial(self.length, num === undefined ? self.length : num)}, TMP_64.$$s = self, TMP_64.$$arity = 0, TMP_64))
      };
      
      var permute, offensive, output;

      if (num === undefined) {
        num = self.length;
      }
      else {
        num = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(num, Opal.const_get($scopes, 'Integer', true, true), "to_int")
      }

      if (num < 0 || self.length < num) {
        // no permutations, yield nothing
      }
      else if (num === 0) {
        // exactly one permutation: the zero-length array
        Opal.yield1(block, [])
      }
      else if (num === 1) {
        // this is a special, easy case
        for (var i = 0; i < self.length; i++) {
          Opal.yield1(block, [self[i]])
        }
      }
      else {
        // this is the general case
        (perm = Opal.const_get($scopes, 'Array', true, true).$new(num));
        (used = Opal.const_get($scopes, 'Array', true, true).$new(self.length, false));

        permute = function(num, perm, index, used, blk) {
          self = this;
          for(var i = 0; i < self.length; i++){
            if(used['$[]'](i)['$!']()) {
              perm[index] = i;
              if(index < num - 1) {
                used[i] = true;
                permute.call(self, num, perm, index + 1, used, blk);
                used[i] = false;
              }
              else {
                output = [];
                for (var j = 0; j < perm.length; j++) {
                  output.push(self[perm[j]]);
                }
                Opal.yield1(blk, output);
              }
            }
          }
        }

        if ((block !== nil)) {
          // offensive (both definitions) copy.
          offensive = self.slice();
          permute.call(offensive, num, perm, 0, used, block);
        }
        else {
          permute.call(self, num, perm, 0, used, block);
        }
      }
    ;
      return self;
    }, TMP_Array_permutation_63.$$arity = -1);
    Opal.defn(self, '$repeated_permutation', TMP_Array_repeated_permutation_65 = function $$repeated_permutation(n) {
      var TMP_66, self = this, $iter = TMP_Array_repeated_permutation_65.$$p, $yield = $iter || nil, num = nil;

      TMP_Array_repeated_permutation_65.$$p = null;
      
      num = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      if (($yield !== nil)) {
        } else {
        return $send(self, 'enum_for', ["repeated_permutation", num], (TMP_66 = function(){var self = TMP_66.$$s || this, $a;

        if ((($a = $rb_ge(num, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return self.$size()['$**'](num)
            } else {
            return 0
          }}, TMP_66.$$s = self, TMP_66.$$arity = 0, TMP_66))
      };
      
      function iterate(max, buffer, self) {
        if (buffer.length == max) {
          var copy = buffer.slice();
          Opal.yield1($yield, copy)
          return;
        }
        for (var i = 0; i < self.length; i++) {
          buffer.push(self[i]);
          iterate(max, buffer, self);
          buffer.pop();
        }
      }

      iterate(num, [], self.slice());
    ;
      return self;
    }, TMP_Array_repeated_permutation_65.$$arity = 1);
    Opal.defn(self, '$pop', TMP_Array_pop_67 = function $$pop(count) {
      var $a, self = this;

      
      if ((($a = count === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil};
        return self.pop();};
      count = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(count, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      if ((($a = count < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "negative array size")};
      if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return []};
      if ((($a = count > self.length) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.splice(0, self.length)
        } else {
        return self.splice(self.length - count, self.length)
      };
    }, TMP_Array_pop_67.$$arity = -1);
    Opal.defn(self, '$product', TMP_Array_product_68 = function $$product($a_rest) {
      var self = this, args, $iter = TMP_Array_product_68.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Array_product_68.$$p = null;
      
      var result = (block !== nil) ? null : [],
          n = args.length + 1,
          counters = new Array(n),
          lengths  = new Array(n),
          arrays   = new Array(n),
          i, m, subarray, len, resultlen = 1;

      arrays[0] = self;
      for (i = 1; i < n; i++) {
        arrays[i] = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(args[i - 1], Opal.const_get($scopes, 'Array', true, true), "to_ary");
      }

      for (i = 0; i < n; i++) {
        len = arrays[i].length;
        if (len === 0) {
          return result || self;
        }
        resultlen *= len;
        if (resultlen > 2147483647) {
          self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "too big to product")
        }
        lengths[i] = len;
        counters[i] = 0;
      }

      outer_loop: for (;;) {
        subarray = [];
        for (i = 0; i < n; i++) {
          subarray.push(arrays[i][counters[i]]);
        }
        if (result) {
          result.push(subarray);
        } else {
          Opal.yield1(block, subarray)
        }
        m = n - 1;
        counters[m]++;
        while (counters[m] === lengths[m]) {
          counters[m] = 0;
          if (--m < 0) break outer_loop;
          counters[m]++;
        }
      }

      return result || self;
    
    }, TMP_Array_product_68.$$arity = -1);
    Opal.defn(self, '$push', TMP_Array_push_69 = function $$push($a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      
      for (var i = 0, length = objects.length; i < length; i++) {
        self.push(objects[i]);
      }
    ;
      return self;
    }, TMP_Array_push_69.$$arity = -1);
    Opal.defn(self, '$rassoc', TMP_Array_rassoc_70 = function $$rassoc(object) {
      var self = this;

      
      for (var i = 0, length = self.length, item; i < length; i++) {
        item = self[i];

        if (item.length && item[1] !== undefined) {
          if ((item[1])['$=='](object)) {
            return item;
          }
        }
      }

      return nil;
    
    }, TMP_Array_rassoc_70.$$arity = 1);
    Opal.defn(self, '$reject', TMP_Array_reject_71 = function $$reject() {
      var TMP_72, self = this, $iter = TMP_Array_reject_71.$$p, block = $iter || nil;

      TMP_Array_reject_71.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["reject"], (TMP_72 = function(){var self = TMP_72.$$s || this;

        return self.$size()}, TMP_72.$$s = self, TMP_72.$$arity = 0, TMP_72))
      };
      
      var result = [];

      for (var i = 0, length = self.length, value; i < length; i++) {
        value = block(self[i]);

        if (value === false || value === nil) {
          result.push(self[i]);
        }
      }
      return result;
    ;
    }, TMP_Array_reject_71.$$arity = 0);
    Opal.defn(self, '$reject!', TMP_Array_reject$B_73 = function() {
      var TMP_74, self = this, $iter = TMP_Array_reject$B_73.$$p, block = $iter || nil, original = nil;

      TMP_Array_reject$B_73.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["reject!"], (TMP_74 = function(){var self = TMP_74.$$s || this;

        return self.$size()}, TMP_74.$$s = self, TMP_74.$$arity = 0, TMP_74))
      };
      original = self.$length();
      $send(self, 'delete_if', [], block.$to_proc());
      if (self.$length()['$=='](original)) {
        return nil
        } else {
        return self
      };
    }, TMP_Array_reject$B_73.$$arity = 0);
    Opal.defn(self, '$replace', TMP_Array_replace_75 = function $$replace(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Array', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        other = other.$to_a()
        } else {
        other = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(other, Opal.const_get($scopes, 'Array', true, true), "to_ary").$to_a()
      };
      
      self.splice(0, self.length);
      self.push.apply(self, other);
    ;
      return self;
    }, TMP_Array_replace_75.$$arity = 1);
    Opal.defn(self, '$reverse', TMP_Array_reverse_76 = function $$reverse() {
      var self = this;

      return self.slice(0).reverse()
    }, TMP_Array_reverse_76.$$arity = 0);
    Opal.defn(self, '$reverse!', TMP_Array_reverse$B_77 = function() {
      var self = this;

      return self.reverse()
    }, TMP_Array_reverse$B_77.$$arity = 0);
    Opal.defn(self, '$reverse_each', TMP_Array_reverse_each_78 = function $$reverse_each() {
      var TMP_79, self = this, $iter = TMP_Array_reverse_each_78.$$p, block = $iter || nil;

      TMP_Array_reverse_each_78.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["reverse_each"], (TMP_79 = function(){var self = TMP_79.$$s || this;

        return self.$size()}, TMP_79.$$s = self, TMP_79.$$arity = 0, TMP_79))
      };
      $send(self.$reverse(), 'each', [], block.$to_proc());
      return self;
    }, TMP_Array_reverse_each_78.$$arity = 0);
    Opal.defn(self, '$rindex', TMP_Array_rindex_80 = function $$rindex(object) {
      var self = this, $iter = TMP_Array_rindex_80.$$p, block = $iter || nil;

      TMP_Array_rindex_80.$$p = null;
      
      var i, value;

      if (object != null) {
        for (i = self.length - 1; i >= 0; i--) {
          if (i >= self.length) {
            break;
          }
          if ((self[i])['$=='](object)) {
            return i;
          }
        }
      }
      else if (block !== nil) {
        for (i = self.length - 1; i >= 0; i--) {
          if (i >= self.length) {
            break;
          }

          value = block(self[i]);

          if (value !== false && value !== nil) {
            return i;
          }
        }
      }
      else if (object == null) {
        return self.$enum_for("rindex");
      }

      return nil;
    
    }, TMP_Array_rindex_80.$$arity = -1);
    Opal.defn(self, '$rotate', TMP_Array_rotate_81 = function $$rotate(n) {
      var self = this;

      if (n == null) {
        n = 1;
      }
      
      n = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      
      var ary, idx, firstPart, lastPart;

      if (self.length === 1) {
        return self.slice();
      }
      if (self.length === 0) {
        return [];
      }

      ary = self.slice();
      idx = n % ary.length;

      firstPart = ary.slice(idx);
      lastPart = ary.slice(0, idx);
      return firstPart.concat(lastPart);
    ;
    }, TMP_Array_rotate_81.$$arity = -1);
    Opal.defn(self, '$rotate!', TMP_Array_rotate$B_82 = function(cnt) {
      var self = this, ary = nil;

      if (cnt == null) {
        cnt = 1;
      }
      
      
      if (self.length === 0 || self.length === 1) {
        return self;
      }
    ;
      cnt = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(cnt, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      ary = self.$rotate(cnt);
      return self.$replace(ary);
    }, TMP_Array_rotate$B_82.$$arity = -1);
    (function($base, $super, $visibility_scopes) {
      function $SampleRandom(){};
      var self = $SampleRandom = $klass($base, $super, 'SampleRandom', $SampleRandom);

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_SampleRandom_initialize_83, TMP_SampleRandom_rand_84;

      def.rng = nil;
      
      Opal.defn(self, '$initialize', TMP_SampleRandom_initialize_83 = function $$initialize(rng) {
        var self = this;

        return (self.rng = rng)
      }, TMP_SampleRandom_initialize_83.$$arity = 1);
      return (Opal.defn(self, '$rand', TMP_SampleRandom_rand_84 = function $$rand(size) {
        var $a, self = this, random = nil;

        
        random = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(self.rng.$rand(size), Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($a = random < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "random value must be >= 0")};
        if ((($a = random < size) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "random value must be less than Array size")
        };
        return random;
      }, TMP_SampleRandom_rand_84.$$arity = 1), nil) && 'rand';
    })($scope.base, null, $scopes);
    Opal.defn(self, '$sample', TMP_Array_sample_85 = function $$sample(count, options) {
      var $a, $b, self = this, o = nil, rng = nil;

      
      if ((($a = count === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$at(Opal.const_get($scopes, 'Kernel', true, true).$rand(self.length))};
      if ((($a = options === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = (o = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](count, Opal.const_get($scopes, 'Hash', true, true), "to_hash"))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          
          options = o;
          count = nil;
          } else {
          
          options = nil;
          count = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(count, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        }
        } else {
        
        count = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(count, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        options = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(options, Opal.const_get($scopes, 'Hash', true, true), "to_hash");
      };
      if ((($a = (($b = count !== false && count !== nil && count != null) ? count < 0 : count)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "count must be greater than 0")};
      if (options !== false && options !== nil && options != null) {
        rng = options['$[]']("random")};
      if ((($a = (($b = rng !== false && rng !== nil && rng != null) ? rng['$respond_to?']("rand") : rng)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        rng = Opal.const_get($scopes, 'SampleRandom', true, true).$new(rng)
        } else {
        rng = Opal.const_get($scopes, 'Kernel', true, true)
      };
      if (count !== false && count !== nil && count != null) {
        } else {
        return self[rng.$rand(self.length)]
      };
      

      var abandon, spin, result, i, j, k, targetIndex, oldValue;

      if (count > self.length) {
        count = self.length;
      }

      switch (count) {
        case 0:
          return [];
          break;
        case 1:
          return [self[rng.$rand(self.length)]];
          break;
        case 2:
          i = rng.$rand(self.length);
          j = rng.$rand(self.length);
          if (i === j) {
            j = i === 0 ? i + 1 : i - 1;
          }
          return [self[i], self[j]];
          break;
        default:
          if (self.length / count > 3) {
            abandon = false;
            spin = 0;

            result = Opal.const_get($scopes, 'Array', true, true).$new(count);
            i = 1;

            result[0] = rng.$rand(self.length);
            while (i < count) {
              k = rng.$rand(self.length);
              j = 0;

              while (j < i) {
                while (k === result[j]) {
                  spin++;
                  if (spin > 100) {
                    abandon = true;
                    break;
                  }
                  k = rng.$rand(self.length);
                }
                if (abandon) { break; }

                j++;
              }

              if (abandon) { break; }

              result[i] = k;

              i++;
            }

            if (!abandon) {
              i = 0;
              while (i < count) {
                result[i] = self[result[i]];
                i++;
              }

              return result;
            }
          }

          result = self.slice();

          for (var c = 0; c < count; c++) {
            targetIndex = rng.$rand(self.length);
            oldValue = result[c];
            result[c] = result[targetIndex];
            result[targetIndex] = oldValue;
          }

          return count === self.length ? result : (result)['$[]'](0, count);
      }
    ;
    }, TMP_Array_sample_85.$$arity = -1);
    Opal.defn(self, '$select', TMP_Array_select_86 = function $$select() {
      var TMP_87, self = this, $iter = TMP_Array_select_86.$$p, block = $iter || nil;

      TMP_Array_select_86.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["select"], (TMP_87 = function(){var self = TMP_87.$$s || this;

        return self.$size()}, TMP_87.$$s = self, TMP_87.$$arity = 0, TMP_87))
      };
      
      var result = [];

      for (var i = 0, length = self.length, item, value; i < length; i++) {
        item = self[i];

        value = Opal.yield1(block, item);

        if (value !== false && value !== nil) {
          result.push(item);
        }
      }

      return result;
    ;
    }, TMP_Array_select_86.$$arity = 0);
    Opal.defn(self, '$select!', TMP_Array_select$B_88 = function() {
      var TMP_89, self = this, $iter = TMP_Array_select$B_88.$$p, block = $iter || nil;

      TMP_Array_select$B_88.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["select!"], (TMP_89 = function(){var self = TMP_89.$$s || this;

        return self.$size()}, TMP_89.$$s = self, TMP_89.$$arity = 0, TMP_89))
      };
      
      var original = self.length;
      $send(self, 'keep_if', [], block.$to_proc());
      return self.length === original ? nil : self;
    ;
    }, TMP_Array_select$B_88.$$arity = 0);
    Opal.defn(self, '$shift', TMP_Array_shift_90 = function $$shift(count) {
      var $a, self = this;

      
      if ((($a = count === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil};
        return self.shift();};
      count = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(count, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      if ((($a = count < 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "negative array size")};
      if ((($a = self.length === 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return []};
      return self.splice(0, count);
    }, TMP_Array_shift_90.$$arity = -1);
    Opal.alias(self, "size", "length");
    Opal.defn(self, '$shuffle', TMP_Array_shuffle_91 = function $$shuffle(rng) {
      var self = this;

      return self.$dup().$to_a()['$shuffle!'](rng)
    }, TMP_Array_shuffle_91.$$arity = -1);
    Opal.defn(self, '$shuffle!', TMP_Array_shuffle$B_92 = function(rng) {
      var self = this;

      
      var randgen, i = self.length, j, tmp;

      if (rng !== undefined) {
        rng = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](rng, Opal.const_get($scopes, 'Hash', true, true), "to_hash");

        if (rng !== nil) {
          rng = rng['$[]']("random");

          if (rng !== nil && rng['$respond_to?']("rand")) {
            randgen = rng;
          }
        }
      }

      while (i) {
        if (randgen) {
          j = randgen.$rand(i).$to_int();

          if (j < 0) {
            self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "" + "random number too small " + (j))
          }

          if (j >= i) {
            self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "" + "random number too big " + (j))
          }
        }
        else {
          j = self.$rand(i);
        }

        tmp = self[--i];
        self[i] = self[j];
        self[j] = tmp;
      }

      return self;
    
    }, TMP_Array_shuffle$B_92.$$arity = -1);
    Opal.alias(self, "slice", "[]");
    Opal.defn(self, '$slice!', TMP_Array_slice$B_93 = function(index, length) {
      var $a, self = this, result = nil, range = nil, range_start = nil, range_end = nil, start = nil;

      
      result = nil;
      if ((($a = length === undefined) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = Opal.const_get($scopes, 'Range', true, true)['$==='](index)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          
          range = index;
          result = self['$[]'](range);
          range_start = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(range.$begin(), Opal.const_get($scopes, 'Integer', true, true), "to_int");
          range_end = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(range.$end(), Opal.const_get($scopes, 'Integer', true, true), "to_int");
          
          if (range_start < 0) {
            range_start += self.length;
          }

          if (range_end < 0) {
            range_end += self.length;
          } else if (range_end >= self.length) {
            range_end = self.length - 1;
            if (range.exclude) {
              range_end += 1;
            }
          }

          var range_length = range_end - range_start;
          if (range.exclude) {
            range_end -= 1;
          } else {
            range_length += 1;
          }

          if (range_start < self.length && range_start >= 0 && range_end < self.length && range_end >= 0 && range_length > 0) {
            self.splice(range_start, range_length);
          }
        ;
          } else {
          
          start = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index, Opal.const_get($scopes, 'Integer', true, true), "to_int");
          
          if (start < 0) {
            start += self.length;
          }

          if (start < 0 || start >= self.length) {
            return nil;
          }

          result = self[start];

          if (start === 0) {
            self.shift();
          } else {
            self.splice(start, 1);
          }
        ;
        }
        } else {
        
        start = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(index, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        length = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(length, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        
        if (length < 0) {
          return nil;
        }

        var end = start + length;

        result = self['$[]'](start, length);

        if (start < 0) {
          start += self.length;
        }

        if (start + length > self.length) {
          length = self.length - start;
        }

        if (start < self.length && start >= 0) {
          self.splice(start, length);
        }
      ;
      };
      return result;
    }, TMP_Array_slice$B_93.$$arity = -2);
    Opal.defn(self, '$sort', TMP_Array_sort_94 = function $$sort() {
      var $a, self = this, $iter = TMP_Array_sort_94.$$p, block = $iter || nil;

      TMP_Array_sort_94.$$p = null;
      
      if ((($a = self.length > 1) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return self
      };
      
      if (block === nil) {
        block = function(a, b) {
          return (a)['$<=>'](b);
        };
      }

      return self.slice().sort(function(x, y) {
        var ret = block(x, y);

        if (ret === nil) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + ((x).$inspect()) + " with " + ((y).$inspect()) + " failed");
        }

        return $rb_gt(ret, 0) ? 1 : ($rb_lt(ret, 0) ? -1 : 0);
      });
    ;
    }, TMP_Array_sort_94.$$arity = 0);
    Opal.defn(self, '$sort!', TMP_Array_sort$B_95 = function() {
      var self = this, $iter = TMP_Array_sort$B_95.$$p, block = $iter || nil;

      TMP_Array_sort$B_95.$$p = null;
      
      var result;

      if ((block !== nil)) {
        result = $send((self.slice()), 'sort', [], block.$to_proc());
      }
      else {
        result = (self.slice()).$sort();
      }

      self.length = 0;
      for(var i = 0, length = result.length; i < length; i++) {
        self.push(result[i]);
      }

      return self;
    
    }, TMP_Array_sort$B_95.$$arity = 0);
    Opal.defn(self, '$sort_by!', TMP_Array_sort_by$B_96 = function() {
      var TMP_97, self = this, $iter = TMP_Array_sort_by$B_96.$$p, block = $iter || nil;

      TMP_Array_sort_by$B_96.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["sort_by!"], (TMP_97 = function(){var self = TMP_97.$$s || this;

        return self.$size()}, TMP_97.$$s = self, TMP_97.$$arity = 0, TMP_97))
      };
      return self.$replace($send(self, 'sort_by', [], block.$to_proc()));
    }, TMP_Array_sort_by$B_96.$$arity = 0);
    Opal.defn(self, '$take', TMP_Array_take_98 = function $$take(count) {
      var self = this;

      
      if (count < 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true));
      }

      return self.slice(0, count);
    
    }, TMP_Array_take_98.$$arity = 1);
    Opal.defn(self, '$take_while', TMP_Array_take_while_99 = function $$take_while() {
      var self = this, $iter = TMP_Array_take_while_99.$$p, block = $iter || nil;

      TMP_Array_take_while_99.$$p = null;
      
      var result = [];

      for (var i = 0, length = self.length, item, value; i < length; i++) {
        item = self[i];

        value = block(item);

        if (value === false || value === nil) {
          return result;
        }

        result.push(item);
      }

      return result;
    
    }, TMP_Array_take_while_99.$$arity = 0);
    Opal.defn(self, '$to_a', TMP_Array_to_a_100 = function $$to_a() {
      var self = this;

      return self
    }, TMP_Array_to_a_100.$$arity = 0);
    Opal.alias(self, "to_ary", "to_a");
    Opal.defn(self, '$to_h', TMP_Array_to_h_101 = function $$to_h() {
      var self = this;

      
      var i, len = self.length, ary, key, val, hash = $hash2([], {});

      for (i = 0; i < len; i++) {
        ary = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](self[i], Opal.const_get($scopes, 'Array', true, true), "to_ary");
        if (!ary.$$is_array) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "wrong element type " + ((ary).$class()) + " at " + (i) + " (expected array)")
        }
        if (ary.length !== 2) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong array length at " + (i) + " (expected 2, was " + ((ary).$length()) + ")")
        }
        key = ary[0];
        val = ary[1];
        Opal.hash_put(hash, key, val);
      }

      return hash;
    
    }, TMP_Array_to_h_101.$$arity = 0);
    Opal.alias(self, "to_s", "inspect");
    Opal.defn(self, '$transpose', TMP_Array_transpose_104 = function $$transpose() {
      var $a, TMP_102, self = this, result = nil, max = nil;

      
      if ((($a = self['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return []};
      result = [];
      max = nil;
      $send(self, 'each', [], (TMP_102 = function(row){var self = TMP_102.$$s || this, $b, TMP_103;
if (row == null) row = nil;
      
        if ((($b = Opal.const_get($scopes, 'Array', true, true)['$==='](row)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          row = row.$to_a()
          } else {
          row = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(row, Opal.const_get($scopes, 'Array', true, true), "to_ary").$to_a()
        };
        ((($b = max) !== false && $b !== nil && $b != null) ? $b : (max = row.length));
        if ((($b = (row.length)['$!='](max)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + "element size differs (" + (row.length) + " should be " + (max))};
        return $send((row.length), 'times', [], (TMP_103 = function(i){var self = TMP_103.$$s || this, $c, $d, $e, entry = nil;
if (i == null) i = nil;
        
          entry = ($c = i, $d = result, ((($e = $d['$[]']($c)) !== false && $e !== nil && $e != null) ? $e : $d['$[]=']($c, [])));
          return entry['$<<'](row.$at(i));}, TMP_103.$$s = self, TMP_103.$$arity = 1, TMP_103));}, TMP_102.$$s = self, TMP_102.$$arity = 1, TMP_102));
      return result;
    }, TMP_Array_transpose_104.$$arity = 0);
    Opal.defn(self, '$uniq', TMP_Array_uniq_105 = function $$uniq() {
      var self = this, $iter = TMP_Array_uniq_105.$$p, block = $iter || nil;

      TMP_Array_uniq_105.$$p = null;
      
      var hash = $hash2([], {}), i, length, item, key;

      if (block === nil) {
        for (i = 0, length = self.length; i < length; i++) {
          item = self[i];
          if (Opal.hash_get(hash, item) === undefined) {
            Opal.hash_put(hash, item, item);
          }
        }
      }
      else {
        for (i = 0, length = self.length; i < length; i++) {
          item = self[i];
          key = Opal.yield1(block, item);
          if (Opal.hash_get(hash, key) === undefined) {
            Opal.hash_put(hash, key, item);
          }
        }
      }

      return toArraySubclass((hash).$values(), self.$class());
    
    }, TMP_Array_uniq_105.$$arity = 0);
    Opal.defn(self, '$uniq!', TMP_Array_uniq$B_106 = function() {
      var self = this, $iter = TMP_Array_uniq$B_106.$$p, block = $iter || nil;

      TMP_Array_uniq$B_106.$$p = null;
      
      var original_length = self.length, hash = $hash2([], {}), i, length, item, key;

      for (i = 0, length = original_length; i < length; i++) {
        item = self[i];
        key = (block === nil ? item : Opal.yield1(block, item));

        if (Opal.hash_get(hash, key) === undefined) {
          Opal.hash_put(hash, key, item);
          continue;
        }

        self.splice(i, 1);
        length--;
        i--;
      }

      return self.length === original_length ? nil : self;
    
    }, TMP_Array_uniq$B_106.$$arity = 0);
    Opal.defn(self, '$unshift', TMP_Array_unshift_107 = function $$unshift($a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      
      for (var i = objects.length - 1; i >= 0; i--) {
        self.unshift(objects[i]);
      }
    ;
      return self;
    }, TMP_Array_unshift_107.$$arity = -1);
    Opal.defn(self, '$values_at', TMP_Array_values_at_110 = function $$values_at($a_rest) {
      var TMP_108, self = this, args, out = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      out = [];
      $send(args, 'each', [], (TMP_108 = function(elem){var self = TMP_108.$$s || this, $a, TMP_109, finish = nil, start = nil, i = nil;
if (elem == null) elem = nil;
      if ((($a = elem['$kind_of?'](Opal.const_get($scopes, 'Range', true, true))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          
          finish = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(elem.$last(), Opal.const_get($scopes, 'Integer', true, true), "to_int");
          start = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(elem.$first(), Opal.const_get($scopes, 'Integer', true, true), "to_int");
          
          if (start < 0) {
            start = start + self.length;
            return nil;;
          }
        ;
          
          if (finish < 0) {
            finish = finish + self.length;
          }
          if (elem['$exclude_end?']()) {
            finish--;
          }
          if (finish < start) {
            return nil;;
          }
        ;
          return $send(start, 'upto', [finish], (TMP_109 = function(i){var self = TMP_109.$$s || this;
if (i == null) i = nil;
          return out['$<<'](self.$at(i))}, TMP_109.$$s = self, TMP_109.$$arity = 1, TMP_109));
          } else {
          
          i = Opal.const_get($scopes, 'Opal', true, true).$coerce_to(elem, Opal.const_get($scopes, 'Integer', true, true), "to_int");
          return out['$<<'](self.$at(i));
        }}, TMP_108.$$s = self, TMP_108.$$arity = 1, TMP_108));
      return out;
    }, TMP_Array_values_at_110.$$arity = -1);
    Opal.defn(self, '$zip', TMP_Array_zip_111 = function $$zip($a_rest) {
      var $b, self = this, others, $iter = TMP_Array_zip_111.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      others = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        others[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Array_zip_111.$$p = null;
      
      var result = [], size = self.length, part, o, i, j, jj;

      for (j = 0, jj = others.length; j < jj; j++) {
        o = others[j];
        if (o.$$is_array) {
          continue;
        }
        if (o.$$is_enumerator) {
          if (o.$size() === Infinity) {
            others[j] = o.$take(size);
          } else {
            others[j] = o.$to_a();
          }
          continue;
        }
        others[j] = ((($b = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](o, Opal.const_get($scopes, 'Array', true, true), "to_ary")) !== false && $b !== nil && $b != null) ? $b : Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](o, Opal.const_get($scopes, 'Enumerator', true, true), "each")).$to_a();
      }

      for (i = 0; i < size; i++) {
        part = [self[i]];

        for (j = 0, jj = others.length; j < jj; j++) {
          o = others[j][i];

          if (o == null) {
            o = nil;
          }

          part[j + 1] = o;
        }

        result[i] = part;
      }

      if (block !== nil) {
        for (i = 0; i < size; i++) {
          block(result[i]);
        }

        return nil;
      }

      return result;
    
    }, TMP_Array_zip_111.$$arity = -1);
    Opal.defs(self, '$inherited', TMP_Array_inherited_112 = function $$inherited(klass) {
      var self = this;

      
      klass.$$proto.$to_a = function() {
        return this.slice(0, this.length);
      }
    
    }, TMP_Array_inherited_112.$$arity = 1);
    Opal.defn(self, '$instance_variables', TMP_Array_instance_variables_113 = function $$instance_variables() {
      var TMP_114, self = this, $iter = TMP_Array_instance_variables_113.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Array_instance_variables_113.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      return $send($send(self, Opal.find_super_dispatcher(self, 'instance_variables', TMP_Array_instance_variables_113, false), $zuper, $iter), 'reject', [], (TMP_114 = function(ivar){var self = TMP_114.$$s || this, $a;
if (ivar == null) ivar = nil;
      return ((($a = /^@\d+$/.test(ivar)) !== false && $a !== nil && $a != null) ? $a : ivar['$==']("@length"))}, TMP_114.$$s = self, TMP_114.$$arity = 1, TMP_114))
    }, TMP_Array_instance_variables_113.$$arity = 0);
    return Opal.const_get($scopes, 'Opal', true, true).$pristine(self, "allocate", "copy_instance_variables", "initialize_dup");
  })($scope.base, Array, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/hash"] = function(Opal) {
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send;

  Opal.add_stubs(['$require', '$include', '$coerce_to?', '$[]', '$merge!', '$allocate', '$raise', '$coerce_to!', '$each', '$fetch', '$>=', '$>', '$==', '$lambda?', '$abs', '$arity', '$call', '$enum_for', '$size', '$respond_to?', '$class', '$dig', '$inspect', '$map', '$to_proc', '$flatten', '$eql?', '$default', '$dup', '$default_proc', '$default_proc=', '$-', '$default=', '$alias_method', '$proc']);
  
  self.$require("corelib/enumerable");
  return (function($base, $super, $visibility_scopes) {
    function $Hash(){};
    var self = $Hash = $klass($base, $super, 'Hash', $Hash);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Hash_$$_1, TMP_Hash_allocate_2, TMP_Hash_try_convert_3, TMP_Hash_initialize_4, TMP_Hash_$eq$eq_5, TMP_Hash_$gt$eq_7, TMP_Hash_$gt_8, TMP_Hash_$lt_9, TMP_Hash_$lt$eq_10, TMP_Hash_$$_11, TMP_Hash_$$$eq_12, TMP_Hash_assoc_13, TMP_Hash_clear_14, TMP_Hash_clone_15, TMP_Hash_default_16, TMP_Hash_default$eq_17, TMP_Hash_default_proc_18, TMP_Hash_default_proc$eq_19, TMP_Hash_delete_20, TMP_Hash_delete_if_21, TMP_Hash_dig_23, TMP_Hash_each_24, TMP_Hash_each_key_26, TMP_Hash_each_value_28, TMP_Hash_empty$q_30, TMP_Hash_fetch_31, TMP_Hash_fetch_values_32, TMP_Hash_flatten_34, TMP_Hash_has_key$q_35, TMP_Hash_has_value$q_36, TMP_Hash_hash_37, TMP_Hash_index_38, TMP_Hash_indexes_39, TMP_Hash_inspect_40, TMP_Hash_invert_41, TMP_Hash_keep_if_42, TMP_Hash_keys_44, TMP_Hash_length_45, TMP_Hash_merge_46, TMP_Hash_merge$B_47, TMP_Hash_rassoc_48, TMP_Hash_rehash_49, TMP_Hash_reject_50, TMP_Hash_reject$B_52, TMP_Hash_replace_54, TMP_Hash_select_55, TMP_Hash_select$B_57, TMP_Hash_shift_59, TMP_Hash_to_a_60, TMP_Hash_to_h_61, TMP_Hash_to_hash_62, TMP_Hash_to_proc_64, TMP_Hash_values_65;

    
    self.$include(Opal.const_get($scopes, 'Enumerable', true, true));
    def.$$is_hash = true;
    Opal.defs(self, '$[]', TMP_Hash_$$_1 = function($a_rest) {
      var self = this, argv;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      argv = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        argv[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var hash, argc = argv.length, i;

      if (argc === 1) {
        hash = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](argv['$[]'](0), Opal.const_get($scopes, 'Hash', true, true), "to_hash");
        if (hash !== nil) {
          return self.$allocate()['$merge!'](hash);
        }

        argv = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](argv['$[]'](0), Opal.const_get($scopes, 'Array', true, true), "to_ary");
        if (argv === nil) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "odd number of arguments for Hash")
        }

        argc = argv.length;
        hash = self.$allocate();

        for (i = 0; i < argc; i++) {
          if (!argv[i].$$is_array) continue;
          switch(argv[i].length) {
          case 1:
            hash.$store(argv[i][0], nil);
            break;
          case 2:
            hash.$store(argv[i][0], argv[i][1]);
            break;
          default:
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid number of elements (" + (argv[i].length) + " for 1..2)")
          }
        }

        return hash;
      }

      if (argc % 2 !== 0) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "odd number of arguments for Hash")
      }

      hash = self.$allocate();

      for (i = 0; i < argc; i += 2) {
        hash.$store(argv[i], argv[i + 1]);
      }

      return hash;
    
    }, TMP_Hash_$$_1.$$arity = -1);
    Opal.defs(self, '$allocate', TMP_Hash_allocate_2 = function $$allocate() {
      var self = this;

      
      var hash = new self.$$alloc();

      Opal.hash_init(hash);

      hash.$$none = nil;
      hash.$$proc = nil;

      return hash;
    
    }, TMP_Hash_allocate_2.$$arity = 0);
    Opal.defs(self, '$try_convert', TMP_Hash_try_convert_3 = function $$try_convert(obj) {
      var self = this;

      return Opal.const_get($scopes, 'Opal', true, true)['$coerce_to?'](obj, Opal.const_get($scopes, 'Hash', true, true), "to_hash")
    }, TMP_Hash_try_convert_3.$$arity = 1);
    Opal.defn(self, '$initialize', TMP_Hash_initialize_4 = function $$initialize(defaults) {
      var self = this, $iter = TMP_Hash_initialize_4.$$p, block = $iter || nil;

      TMP_Hash_initialize_4.$$p = null;
      
      
      if (defaults !== undefined && block !== nil) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "wrong number of arguments (1 for 0)")
      }
      self.$$none = (defaults === undefined ? nil : defaults);
      self.$$proc = block;
    ;
      return self;
    }, TMP_Hash_initialize_4.$$arity = -1);
    Opal.defn(self, '$==', TMP_Hash_$eq$eq_5 = function(other) {
      var self = this;

      
      if (self === other) {
        return true;
      }

      if (!other.$$is_hash) {
        return false;
      }

      if (self.$$keys.length !== other.$$keys.length) {
        return false;
      }

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, other_value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
          other_value = other.$$smap[key];
        } else {
          value = key.value;
          other_value = Opal.hash_get(other, key.key);
        }

        if (other_value === undefined || !value['$eql?'](other_value)) {
          return false;
        }
      }

      return true;
    
    }, TMP_Hash_$eq$eq_5.$$arity = 1);
    Opal.defn(self, '$>=', TMP_Hash_$gt$eq_7 = function(other) {
      var TMP_6, self = this, result = nil;

      
      other = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](other, Opal.const_get($scopes, 'Hash', true, true), "to_hash");
      
      if (self.$$keys.length < other.$$keys.length) {
        return false
      }
    ;
      result = true;
      $send(other, 'each', [], (TMP_6 = function(other_key, other_val){var self = TMP_6.$$s || this, val = nil;
if (other_key == null) other_key = nil;if (other_val == null) other_val = nil;
      
        val = self.$fetch(other_key, null);
        
        if (val == null || val !== other_val) {
          result = false;
          return;
        }
      ;}, TMP_6.$$s = self, TMP_6.$$arity = 2, TMP_6));
      return result;
    }, TMP_Hash_$gt$eq_7.$$arity = 1);
    Opal.defn(self, '$>', TMP_Hash_$gt_8 = function(other) {
      var self = this;

      
      other = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](other, Opal.const_get($scopes, 'Hash', true, true), "to_hash");
      
      if (self.$$keys.length <= other.$$keys.length) {
        return false
      }
    ;
      return $rb_ge(self, other);
    }, TMP_Hash_$gt_8.$$arity = 1);
    Opal.defn(self, '$<', TMP_Hash_$lt_9 = function(other) {
      var self = this;

      
      other = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](other, Opal.const_get($scopes, 'Hash', true, true), "to_hash");
      return $rb_gt(other, self);
    }, TMP_Hash_$lt_9.$$arity = 1);
    Opal.defn(self, '$<=', TMP_Hash_$lt$eq_10 = function(other) {
      var self = this;

      
      other = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](other, Opal.const_get($scopes, 'Hash', true, true), "to_hash");
      return $rb_ge(other, self);
    }, TMP_Hash_$lt$eq_10.$$arity = 1);
    Opal.defn(self, '$[]', TMP_Hash_$$_11 = function(key) {
      var self = this;

      
      var value = Opal.hash_get(self, key);

      if (value !== undefined) {
        return value;
      }

      return self.$default(key);
    
    }, TMP_Hash_$$_11.$$arity = 1);
    Opal.defn(self, '$[]=', TMP_Hash_$$$eq_12 = function(key, value) {
      var self = this;

      
      Opal.hash_put(self, key, value);
      return value;
    
    }, TMP_Hash_$$$eq_12.$$arity = 2);
    Opal.defn(self, '$assoc', TMP_Hash_assoc_13 = function $$assoc(object) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          if ((key)['$=='](object)) {
            return [key, self.$$smap[key]];
          }
        } else {
          if ((key.key)['$=='](object)) {
            return [key.key, key.value];
          }
        }
      }

      return nil;
    
    }, TMP_Hash_assoc_13.$$arity = 1);
    Opal.defn(self, '$clear', TMP_Hash_clear_14 = function $$clear() {
      var self = this;

      
      Opal.hash_init(self);
      return self;
    
    }, TMP_Hash_clear_14.$$arity = 0);
    Opal.defn(self, '$clone', TMP_Hash_clone_15 = function $$clone() {
      var self = this;

      
      var hash = new self.$$class.$$alloc();

      Opal.hash_init(hash);
      Opal.hash_clone(self, hash);

      return hash;
    
    }, TMP_Hash_clone_15.$$arity = 0);
    Opal.defn(self, '$default', TMP_Hash_default_16 = function(key) {
      var self = this;

      
      if (key !== undefined && self.$$proc !== nil && self.$$proc !== undefined) {
        return self.$$proc.$call(self, key);
      }
      if (self.$$none === undefined) {
        return nil;
      }
      return self.$$none;
    
    }, TMP_Hash_default_16.$$arity = -1);
    Opal.defn(self, '$default=', TMP_Hash_default$eq_17 = function(object) {
      var self = this;

      
      self.$$proc = nil;
      self.$$none = object;

      return object;
    
    }, TMP_Hash_default$eq_17.$$arity = 1);
    Opal.defn(self, '$default_proc', TMP_Hash_default_proc_18 = function $$default_proc() {
      var self = this;

      
      if (self.$$proc !== undefined) {
        return self.$$proc;
      }
      return nil;
    
    }, TMP_Hash_default_proc_18.$$arity = 0);
    Opal.defn(self, '$default_proc=', TMP_Hash_default_proc$eq_19 = function(default_proc) {
      var self = this;

      
      var proc = default_proc;

      if (proc !== nil) {
        proc = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](proc, Opal.const_get($scopes, 'Proc', true, true), "to_proc");

        if ((proc)['$lambda?']() && (proc).$arity().$abs() !== 2) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "default_proc takes two arguments");
        }
      }

      self.$$none = nil;
      self.$$proc = proc;

      return default_proc;
    
    }, TMP_Hash_default_proc$eq_19.$$arity = 1);
    Opal.defn(self, '$delete', TMP_Hash_delete_20 = function(key) {
      var self = this, $iter = TMP_Hash_delete_20.$$p, block = $iter || nil;

      TMP_Hash_delete_20.$$p = null;
      
      var value = Opal.hash_delete(self, key);

      if (value !== undefined) {
        return value;
      }

      if (block !== nil) {
        return block.$call(key);
      }

      return nil;
    
    }, TMP_Hash_delete_20.$$arity = 1);
    Opal.defn(self, '$delete_if', TMP_Hash_delete_if_21 = function $$delete_if() {
      var TMP_22, self = this, $iter = TMP_Hash_delete_if_21.$$p, block = $iter || nil;

      TMP_Hash_delete_if_21.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["delete_if"], (TMP_22 = function(){var self = TMP_22.$$s || this;

        return self.$size()}, TMP_22.$$s = self, TMP_22.$$arity = 0, TMP_22))
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj !== false && obj !== nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            length--;
            i--;
          }
        }
      }

      return self;
    ;
    }, TMP_Hash_delete_if_21.$$arity = 0);
    Opal.alias(self, "dup", "clone");
    Opal.defn(self, '$dig', TMP_Hash_dig_23 = function $$dig(key, $a_rest) {
      var $b, self = this, keys, item = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      keys = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        keys[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      item = self['$[]'](key);
      
      if (item === nil || keys.length === 0) {
        return item;
      }
    ;
      if ((($b = item['$respond_to?']("dig")) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + (item.$class()) + " does not have #dig method")
      };
      return $send(item, 'dig', Opal.to_a(keys));
    }, TMP_Hash_dig_23.$$arity = -2);
    Opal.defn(self, '$each', TMP_Hash_each_24 = function $$each() {
      var TMP_25, self = this, $iter = TMP_Hash_each_24.$$p, block = $iter || nil;

      TMP_Hash_each_24.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["each"], (TMP_25 = function(){var self = TMP_25.$$s || this;

        return self.$size()}, TMP_25.$$s = self, TMP_25.$$arity = 0, TMP_25))
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        Opal.yield1(block, [key, value]);
      }

      return self;
    ;
    }, TMP_Hash_each_24.$$arity = 0);
    Opal.defn(self, '$each_key', TMP_Hash_each_key_26 = function $$each_key() {
      var TMP_27, self = this, $iter = TMP_Hash_each_key_26.$$p, block = $iter || nil;

      TMP_Hash_each_key_26.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["each_key"], (TMP_27 = function(){var self = TMP_27.$$s || this;

        return self.$size()}, TMP_27.$$s = self, TMP_27.$$arity = 0, TMP_27))
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        block(key.$$is_string ? key : key.key);
      }

      return self;
    ;
    }, TMP_Hash_each_key_26.$$arity = 0);
    Opal.alias(self, "each_pair", "each");
    Opal.defn(self, '$each_value', TMP_Hash_each_value_28 = function $$each_value() {
      var TMP_29, self = this, $iter = TMP_Hash_each_value_28.$$p, block = $iter || nil;

      TMP_Hash_each_value_28.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["each_value"], (TMP_29 = function(){var self = TMP_29.$$s || this;

        return self.$size()}, TMP_29.$$s = self, TMP_29.$$arity = 0, TMP_29))
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        block(key.$$is_string ? self.$$smap[key] : key.value);
      }

      return self;
    ;
    }, TMP_Hash_each_value_28.$$arity = 0);
    Opal.defn(self, '$empty?', TMP_Hash_empty$q_30 = function() {
      var self = this;

      return self.$$keys.length === 0
    }, TMP_Hash_empty$q_30.$$arity = 0);
    Opal.alias(self, "eql?", "==");
    Opal.defn(self, '$fetch', TMP_Hash_fetch_31 = function $$fetch(key, defaults) {
      var self = this, $iter = TMP_Hash_fetch_31.$$p, block = $iter || nil;

      TMP_Hash_fetch_31.$$p = null;
      
      
      var value = Opal.hash_get(self, key);

      if (value !== undefined) {
        return value;
      }

      if (block !== nil) {
        return block(key);
      }

      if (defaults !== undefined) {
        return defaults;
      }
    ;
      return self.$raise(Opal.const_get($scopes, 'KeyError', true, true), "" + "key not found: " + (key.$inspect()));
    }, TMP_Hash_fetch_31.$$arity = -2);
    Opal.defn(self, '$fetch_values', TMP_Hash_fetch_values_32 = function $$fetch_values($a_rest) {
      var TMP_33, self = this, keys, $iter = TMP_Hash_fetch_values_32.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      keys = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        keys[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Hash_fetch_values_32.$$p = null;
      return $send(keys, 'map', [], (TMP_33 = function(key){var self = TMP_33.$$s || this;
if (key == null) key = nil;
      return $send(self, 'fetch', [key], block.$to_proc())}, TMP_33.$$s = self, TMP_33.$$arity = 1, TMP_33))
    }, TMP_Hash_fetch_values_32.$$arity = -1);
    Opal.defn(self, '$flatten', TMP_Hash_flatten_34 = function $$flatten(level) {
      var self = this;

      if (level == null) {
        level = 1;
      }
      
      level = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](level, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        result.push(key);

        if (value.$$is_array) {
          if (level === 1) {
            result.push(value);
            continue;
          }

          result = result.concat((value).$flatten(level - 2));
          continue;
        }

        result.push(value);
      }

      return result;
    ;
    }, TMP_Hash_flatten_34.$$arity = -1);
    Opal.defn(self, '$has_key?', TMP_Hash_has_key$q_35 = function(key) {
      var self = this;

      return Opal.hash_get(self, key) !== undefined
    }, TMP_Hash_has_key$q_35.$$arity = 1);
    Opal.defn(self, '$has_value?', TMP_Hash_has_value$q_36 = function(value) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (((key.$$is_string ? self.$$smap[key] : key.value))['$=='](value)) {
          return true;
        }
      }

      return false;
    
    }, TMP_Hash_has_value$q_36.$$arity = 1);
    Opal.defn(self, '$hash', TMP_Hash_hash_37 = function $$hash() {
      var self = this;

      
      var top = (Opal.hash_ids === undefined),
          hash_id = self.$object_id(),
          result = ['Hash'],
          key, item;

      try {
        if (top) {
          Opal.hash_ids = {};
        }

        if (Opal.hash_ids.hasOwnProperty(hash_id)) {
          return 'self';
        }

        for (key in Opal.hash_ids) {
          if (Opal.hash_ids.hasOwnProperty(key)) {
            item = Opal.hash_ids[key];
            if (self['$eql?'](item)) {
              return 'self';
            }
          }
        }

        Opal.hash_ids[hash_id] = self;

        for (var i = 0, keys = self.$$keys, length = keys.length; i < length; i++) {
          key = keys[i];

          if (key.$$is_string) {
            result.push([key, self.$$smap[key].$hash()]);
          } else {
            result.push([key.key_hash, key.value.$hash()]);
          }
        }

        return result.sort().join();

      } finally {
        if (top) {
          delete Opal.hash_ids;
        }
      }
    
    }, TMP_Hash_hash_37.$$arity = 0);
    Opal.alias(self, "include?", "has_key?");
    Opal.defn(self, '$index', TMP_Hash_index_38 = function $$index(object) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        if ((value)['$=='](object)) {
          return key;
        }
      }

      return nil;
    
    }, TMP_Hash_index_38.$$arity = 1);
    Opal.defn(self, '$indexes', TMP_Hash_indexes_39 = function $$indexes($a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      var result = [];

      for (var i = 0, length = args.length, key, value; i < length; i++) {
        key = args[i];
        value = Opal.hash_get(self, key);

        if (value === undefined) {
          result.push(self.$default());
          continue;
        }

        result.push(value);
      }

      return result;
    
    }, TMP_Hash_indexes_39.$$arity = -1);
    Opal.alias(self, "indices", "indexes");
    var inspect_ids;;
    Opal.defn(self, '$inspect', TMP_Hash_inspect_40 = function $$inspect() {
      var self = this;

      
      var top = (inspect_ids === undefined),
          hash_id = self.$object_id(),
          result = [];

      try {
        if (top) {
          inspect_ids = {};
        }

        if (inspect_ids.hasOwnProperty(hash_id)) {
          return '{...}';
        }

        inspect_ids[hash_id] = true;

        for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
          key = keys[i];

          if (key.$$is_string) {
            value = self.$$smap[key];
          } else {
            value = key.value;
            key = key.key;
          }

          result.push(key.$inspect() + '=>' + value.$inspect());
        }

        return '{' + result.join(', ') + '}';

      } finally {
        if (top) {
          inspect_ids = undefined;
        }
      }
    
    }, TMP_Hash_inspect_40.$$arity = 0);
    Opal.defn(self, '$invert', TMP_Hash_invert_41 = function $$invert() {
      var self = this;

      
      var hash = Opal.hash();

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        Opal.hash_put(hash, value, key);
      }

      return hash;
    
    }, TMP_Hash_invert_41.$$arity = 0);
    Opal.defn(self, '$keep_if', TMP_Hash_keep_if_42 = function $$keep_if() {
      var TMP_43, self = this, $iter = TMP_Hash_keep_if_42.$$p, block = $iter || nil;

      TMP_Hash_keep_if_42.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["keep_if"], (TMP_43 = function(){var self = TMP_43.$$s || this;

        return self.$size()}, TMP_43.$$s = self, TMP_43.$$arity = 0, TMP_43))
      };
      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === false || obj === nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            length--;
            i--;
          }
        }
      }

      return self;
    ;
    }, TMP_Hash_keep_if_42.$$arity = 0);
    Opal.alias(self, "key", "index");
    Opal.alias(self, "key?", "has_key?");
    Opal.defn(self, '$keys', TMP_Hash_keys_44 = function $$keys() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          result.push(key);
        } else {
          result.push(key.key);
        }
      }

      return result;
    
    }, TMP_Hash_keys_44.$$arity = 0);
    Opal.defn(self, '$length', TMP_Hash_length_45 = function $$length() {
      var self = this;

      return self.$$keys.length
    }, TMP_Hash_length_45.$$arity = 0);
    Opal.alias(self, "member?", "has_key?");
    Opal.defn(self, '$merge', TMP_Hash_merge_46 = function $$merge(other) {
      var self = this, $iter = TMP_Hash_merge_46.$$p, block = $iter || nil;

      TMP_Hash_merge_46.$$p = null;
      return $send(self.$dup(), 'merge!', [other], block.$to_proc())
    }, TMP_Hash_merge_46.$$arity = 1);
    Opal.defn(self, '$merge!', TMP_Hash_merge$B_47 = function(other) {
      var self = this, $iter = TMP_Hash_merge$B_47.$$p, block = $iter || nil;

      TMP_Hash_merge$B_47.$$p = null;
      
      if (!other.$$is_hash) {
        other = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](other, Opal.const_get($scopes, 'Hash', true, true), "to_hash");
      }

      var i, other_keys = other.$$keys, length = other_keys.length, key, value, other_value;

      if (block === nil) {
        for (i = 0; i < length; i++) {
          key = other_keys[i];

          if (key.$$is_string) {
            other_value = other.$$smap[key];
          } else {
            other_value = key.value;
            key = key.key;
          }

          Opal.hash_put(self, key, other_value);
        }

        return self;
      }

      for (i = 0; i < length; i++) {
        key = other_keys[i];

        if (key.$$is_string) {
          other_value = other.$$smap[key];
        } else {
          other_value = key.value;
          key = key.key;
        }

        value = Opal.hash_get(self, key);

        if (value === undefined) {
          Opal.hash_put(self, key, other_value);
          continue;
        }

        Opal.hash_put(self, key, block(key, value, other_value));
      }

      return self;
    
    }, TMP_Hash_merge$B_47.$$arity = 1);
    Opal.defn(self, '$rassoc', TMP_Hash_rassoc_48 = function $$rassoc(object) {
      var self = this;

      
      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        if ((value)['$=='](object)) {
          return [key, value];
        }
      }

      return nil;
    
    }, TMP_Hash_rassoc_48.$$arity = 1);
    Opal.defn(self, '$rehash', TMP_Hash_rehash_49 = function $$rehash() {
      var self = this;

      
      Opal.hash_rehash(self);
      return self;
    
    }, TMP_Hash_rehash_49.$$arity = 0);
    Opal.defn(self, '$reject', TMP_Hash_reject_50 = function $$reject() {
      var TMP_51, self = this, $iter = TMP_Hash_reject_50.$$p, block = $iter || nil;

      TMP_Hash_reject_50.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["reject"], (TMP_51 = function(){var self = TMP_51.$$s || this;

        return self.$size()}, TMP_51.$$s = self, TMP_51.$$arity = 0, TMP_51))
      };
      
      var hash = Opal.hash();

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === false || obj === nil) {
          Opal.hash_put(hash, key, value);
        }
      }

      return hash;
    ;
    }, TMP_Hash_reject_50.$$arity = 0);
    Opal.defn(self, '$reject!', TMP_Hash_reject$B_52 = function() {
      var TMP_53, self = this, $iter = TMP_Hash_reject$B_52.$$p, block = $iter || nil;

      TMP_Hash_reject$B_52.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["reject!"], (TMP_53 = function(){var self = TMP_53.$$s || this;

        return self.$size()}, TMP_53.$$s = self, TMP_53.$$arity = 0, TMP_53))
      };
      
      var changes_were_made = false;

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj !== false && obj !== nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            changes_were_made = true;
            length--;
            i--;
          }
        }
      }

      return changes_were_made ? self : nil;
    ;
    }, TMP_Hash_reject$B_52.$$arity = 0);
    Opal.defn(self, '$replace', TMP_Hash_replace_54 = function $$replace(other) {
      var $a, self = this, $writer = nil;

      
      other = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](other, Opal.const_get($scopes, 'Hash', true, true), "to_hash");
      
      Opal.hash_init(self);

      for (var i = 0, other_keys = other.$$keys, length = other_keys.length, key, value, other_value; i < length; i++) {
        key = other_keys[i];

        if (key.$$is_string) {
          other_value = other.$$smap[key];
        } else {
          other_value = key.value;
          key = key.key;
        }

        Opal.hash_put(self, key, other_value);
      }
    ;
      if ((($a = other.$default_proc()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        $writer = [other.$default_proc()];
        $send(self, 'default_proc=', Opal.to_a($writer));
        $writer[$rb_minus($writer["length"], 1)];
        } else {
        
        $writer = [other.$default()];
        $send(self, 'default=', Opal.to_a($writer));
        $writer[$rb_minus($writer["length"], 1)];
      };
      return self;
    }, TMP_Hash_replace_54.$$arity = 1);
    Opal.defn(self, '$select', TMP_Hash_select_55 = function $$select() {
      var TMP_56, self = this, $iter = TMP_Hash_select_55.$$p, block = $iter || nil;

      TMP_Hash_select_55.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["select"], (TMP_56 = function(){var self = TMP_56.$$s || this;

        return self.$size()}, TMP_56.$$s = self, TMP_56.$$arity = 0, TMP_56))
      };
      
      var hash = Opal.hash();

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj !== false && obj !== nil) {
          Opal.hash_put(hash, key, value);
        }
      }

      return hash;
    ;
    }, TMP_Hash_select_55.$$arity = 0);
    Opal.defn(self, '$select!', TMP_Hash_select$B_57 = function() {
      var TMP_58, self = this, $iter = TMP_Hash_select$B_57.$$p, block = $iter || nil;

      TMP_Hash_select$B_57.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["select!"], (TMP_58 = function(){var self = TMP_58.$$s || this;

        return self.$size()}, TMP_58.$$s = self, TMP_58.$$arity = 0, TMP_58))
      };
      
      var result = nil;

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value, obj; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        obj = block(key, value);

        if (obj === false || obj === nil) {
          if (Opal.hash_delete(self, key) !== undefined) {
            length--;
            i--;
          }
          result = self;
        }
      }

      return result;
    ;
    }, TMP_Hash_select$B_57.$$arity = 0);
    Opal.defn(self, '$shift', TMP_Hash_shift_59 = function $$shift() {
      var self = this;

      
      var keys = self.$$keys,
          key;

      if (keys.length > 0) {
        key = keys[0];

        key = key.$$is_string ? key : key.key;

        return [key, Opal.hash_delete(self, key)];
      }

      return self.$default(nil);
    
    }, TMP_Hash_shift_59.$$arity = 0);
    Opal.alias(self, "size", "length");
    self.$alias_method("store", "[]=");
    Opal.defn(self, '$to_a', TMP_Hash_to_a_60 = function $$to_a() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key, value; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          value = self.$$smap[key];
        } else {
          value = key.value;
          key = key.key;
        }

        result.push([key, value]);
      }

      return result;
    
    }, TMP_Hash_to_a_60.$$arity = 0);
    Opal.defn(self, '$to_h', TMP_Hash_to_h_61 = function $$to_h() {
      var self = this;

      
      if (self.$$class === Opal.Hash) {
        return self;
      }

      var hash = new Opal.Hash.$$alloc();

      Opal.hash_init(hash);
      Opal.hash_clone(self, hash);

      return hash;
    
    }, TMP_Hash_to_h_61.$$arity = 0);
    Opal.defn(self, '$to_hash', TMP_Hash_to_hash_62 = function $$to_hash() {
      var self = this;

      return self
    }, TMP_Hash_to_hash_62.$$arity = 0);
    Opal.defn(self, '$to_proc', TMP_Hash_to_proc_64 = function $$to_proc() {
      var TMP_63, self = this;

      return $send(self, 'proc', [], (TMP_63 = function(key){var self = TMP_63.$$s || this;

      
        
        if (key == null) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "no key given")
        }
      ;
        return self['$[]'](key);}, TMP_63.$$s = self, TMP_63.$$arity = -1, TMP_63))
    }, TMP_Hash_to_proc_64.$$arity = 0);
    Opal.alias(self, "to_s", "inspect");
    Opal.alias(self, "update", "merge!");
    Opal.alias(self, "value?", "has_value?");
    Opal.alias(self, "values_at", "indexes");
    return (Opal.defn(self, '$values', TMP_Hash_values_65 = function $$values() {
      var self = this;

      
      var result = [];

      for (var i = 0, keys = self.$$keys, length = keys.length, key; i < length; i++) {
        key = keys[i];

        if (key.$$is_string) {
          result.push(self.$$smap[key]);
        } else {
          result.push(key.value);
        }
      }

      return result;
    
    }, TMP_Hash_values_65.$$arity = 0), nil) && 'values';
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/number"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$bridge', '$raise', '$class', '$Float', '$respond_to?', '$coerce_to!', '$__coerced__', '$===', '$!', '$>', '$**', '$new', '$<', '$to_f', '$==', '$nan?', '$infinite?', '$enum_for', '$+', '$-', '$gcd', '$lcm', '$/', '$frexp', '$to_i', '$ldexp', '$rationalize', '$*', '$<<', '$to_r', '$-@', '$size', '$<=', '$>=']);
  
  self.$require("corelib/numeric");
  (function($base, $super, $visibility_scopes) {
    function $Number(){};
    var self = $Number = $klass($base, $super, 'Number', $Number);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Number_coerce_1, TMP_Number___id___2, TMP_Number_$_3, TMP_Number_$_4, TMP_Number_$_5, TMP_Number_$_6, TMP_Number_$_7, TMP_Number_$_8, TMP_Number_$_9, TMP_Number_$_10, TMP_Number_$lt_11, TMP_Number_$lt$eq_12, TMP_Number_$gt_13, TMP_Number_$gt$eq_14, TMP_Number_$lt$eq$gt_15, TMP_Number_$lt$lt_16, TMP_Number_$gt$gt_17, TMP_Number_$$_18, TMP_Number_$$_19, TMP_Number_$$_20, TMP_Number_$_21, TMP_Number_$$_22, TMP_Number_$eq$eq_23, TMP_Number_abs_24, TMP_Number_abs2_25, TMP_Number_angle_26, TMP_Number_bit_length_27, TMP_Number_ceil_28, TMP_Number_chr_29, TMP_Number_denominator_30, TMP_Number_downto_31, TMP_Number_equal$q_33, TMP_Number_even$q_34, TMP_Number_floor_35, TMP_Number_gcd_36, TMP_Number_gcdlcm_37, TMP_Number_integer$q_38, TMP_Number_is_a$q_39, TMP_Number_instance_of$q_40, TMP_Number_lcm_41, TMP_Number_next_42, TMP_Number_nonzero$q_43, TMP_Number_numerator_44, TMP_Number_odd$q_45, TMP_Number_ord_46, TMP_Number_pred_47, TMP_Number_quo_48, TMP_Number_rationalize_49, TMP_Number_round_50, TMP_Number_step_51, TMP_Number_times_53, TMP_Number_to_f_55, TMP_Number_to_i_56, TMP_Number_to_r_57, TMP_Number_to_s_58, TMP_Number_divmod_59, TMP_Number_upto_60, TMP_Number_zero$q_62, TMP_Number_size_63, TMP_Number_nan$q_64, TMP_Number_finite$q_65, TMP_Number_infinite$q_66, TMP_Number_positive$q_67, TMP_Number_negative$q_68;

    
    Opal.const_get($scopes, 'Opal', true, true).$bridge(self, Number);
    Number.prototype.$$is_number = true;
    self.$$is_number_class = true;
    Opal.defn(self, '$coerce', TMP_Number_coerce_1 = function $$coerce(other) {
      var self = this;

      
      if (other === nil) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't convert " + (other.$class()) + " into Float");
      }
      else if (other.$$is_string) {
        return [self.$Float(other), self];
      }
      else if (other['$respond_to?']("to_f")) {
        return [Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](other, Opal.const_get($scopes, 'Float', true, true), "to_f"), self];
      }
      else if (other.$$is_number) {
        return [other, self];
      }
      else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't convert " + (other.$class()) + " into Float");
      }
    
    }, TMP_Number_coerce_1.$$arity = 1);
    Opal.defn(self, '$__id__', TMP_Number___id___2 = function $$__id__() {
      var self = this;

      return (self * 2) + 1
    }, TMP_Number___id___2.$$arity = 0);
    Opal.alias(self, "object_id", "__id__");
    Opal.defn(self, '$+', TMP_Number_$_3 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self + other;
      }
      else {
        return self.$__coerced__("+", other);
      }
    
    }, TMP_Number_$_3.$$arity = 1);
    Opal.defn(self, '$-', TMP_Number_$_4 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self - other;
      }
      else {
        return self.$__coerced__("-", other);
      }
    
    }, TMP_Number_$_4.$$arity = 1);
    Opal.defn(self, '$*', TMP_Number_$_5 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self * other;
      }
      else {
        return self.$__coerced__("*", other);
      }
    
    }, TMP_Number_$_5.$$arity = 1);
    Opal.defn(self, '$/', TMP_Number_$_6 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self / other;
      }
      else {
        return self.$__coerced__("/", other);
      }
    
    }, TMP_Number_$_6.$$arity = 1);
    Opal.alias(self, "fdiv", "/");
    Opal.defn(self, '$%', TMP_Number_$_7 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        if (other == -Infinity) {
          return other;
        }
        else if (other == 0) {
          self.$raise(Opal.const_get($scopes, 'ZeroDivisionError', true, true), "divided by 0");
        }
        else if (other < 0 || self < 0) {
          return (self % other + other) % other;
        }
        else {
          return self % other;
        }
      }
      else {
        return self.$__coerced__("%", other);
      }
    
    }, TMP_Number_$_7.$$arity = 1);
    Opal.defn(self, '$&', TMP_Number_$_8 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self & other;
      }
      else {
        return self.$__coerced__("&", other);
      }
    
    }, TMP_Number_$_8.$$arity = 1);
    Opal.defn(self, '$|', TMP_Number_$_9 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self | other;
      }
      else {
        return self.$__coerced__("|", other);
      }
    
    }, TMP_Number_$_9.$$arity = 1);
    Opal.defn(self, '$^', TMP_Number_$_10 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self ^ other;
      }
      else {
        return self.$__coerced__("^", other);
      }
    
    }, TMP_Number_$_10.$$arity = 1);
    Opal.defn(self, '$<', TMP_Number_$lt_11 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self < other;
      }
      else {
        return self.$__coerced__("<", other);
      }
    
    }, TMP_Number_$lt_11.$$arity = 1);
    Opal.defn(self, '$<=', TMP_Number_$lt$eq_12 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self <= other;
      }
      else {
        return self.$__coerced__("<=", other);
      }
    
    }, TMP_Number_$lt$eq_12.$$arity = 1);
    Opal.defn(self, '$>', TMP_Number_$gt_13 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self > other;
      }
      else {
        return self.$__coerced__(">", other);
      }
    
    }, TMP_Number_$gt_13.$$arity = 1);
    Opal.defn(self, '$>=', TMP_Number_$gt$eq_14 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self >= other;
      }
      else {
        return self.$__coerced__(">=", other);
      }
    
    }, TMP_Number_$gt$eq_14.$$arity = 1);
    
    var spaceship_operator = function(self, other) {
      if (other.$$is_number) {
        if (isNaN(self) || isNaN(other)) {
          return nil;
        }

        if (self > other) {
          return 1;
        } else if (self < other) {
          return -1;
        } else {
          return 0;
        }
      }
      else {
        return self.$__coerced__("<=>", other);
      }
    }
  ;
    Opal.defn(self, '$<=>', TMP_Number_$lt$eq$gt_15 = function(other) {
      var self = this;

      try {
        
      return spaceship_operator(self, other);
    
      } catch ($err) {
        if (Opal.rescue($err, [Opal.const_get($scopes, 'ArgumentError', true, true)])) {
          try {
            return nil
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      }
    }, TMP_Number_$lt$eq$gt_15.$$arity = 1);
    Opal.defn(self, '$<<', TMP_Number_$lt$lt_16 = function(count) {
      var self = this;

      
      count = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](count, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      return count > 0 ? self << count : self >> -count;
    }, TMP_Number_$lt$lt_16.$$arity = 1);
    Opal.defn(self, '$>>', TMP_Number_$gt$gt_17 = function(count) {
      var self = this;

      
      count = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](count, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      return count > 0 ? self >> count : self << -count;
    }, TMP_Number_$gt$gt_17.$$arity = 1);
    Opal.defn(self, '$[]', TMP_Number_$$_18 = function(bit) {
      var self = this;

      
      bit = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](bit, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      
      if (bit < 0) {
        return 0;
      }
      if (bit >= 32) {
        return self < 0 ? 1 : 0;
      }
      return (self >> bit) & 1;
    ;
    }, TMP_Number_$$_18.$$arity = 1);
    Opal.defn(self, '$+@', TMP_Number_$$_19 = function() {
      var self = this;

      return +self
    }, TMP_Number_$$_19.$$arity = 0);
    Opal.defn(self, '$-@', TMP_Number_$$_20 = function() {
      var self = this;

      return -self
    }, TMP_Number_$$_20.$$arity = 0);
    Opal.defn(self, '$~', TMP_Number_$_21 = function() {
      var self = this;

      return ~self
    }, TMP_Number_$_21.$$arity = 0);
    Opal.defn(self, '$**', TMP_Number_$$_22 = function(other) {
      var $a, $b, $c, self = this;

      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ((($b = Opal.const_get($scopes, 'Integer', true, true)['$==='](self)['$!']()) !== false && $b !== nil && $b != null) ? $b : $rb_gt(other, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return Math.pow(self, other)
          } else {
          return Opal.const_get($scopes, 'Rational', true, true).$new(self, 1)['$**'](other)
        }
      } else if ((($a = (($b = $rb_lt(self, 0)) ? ((($c = Opal.const_get($scopes, 'Float', true, true)['$==='](other)) !== false && $c !== nil && $c != null) ? $c : Opal.const_get($scopes, 'Rational', true, true)['$==='](other)) : $rb_lt(self, 0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Opal.const_get($scopes, 'Complex', true, true).$new(self, 0)['$**'](other.$to_f())
      } else if ((($a = other.$$is_number != null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Math.pow(self, other)
        } else {
        return self.$__coerced__("**", other)
      }
    }, TMP_Number_$$_22.$$arity = 1);
    Opal.defn(self, '$==', TMP_Number_$eq$eq_23 = function(other) {
      var self = this;

      
      if (other.$$is_number) {
        return self == Number(other);
      }
      else if (other['$respond_to?']("==")) {
        return other['$=='](self);
      }
      else {
        return false;
      }
    
    }, TMP_Number_$eq$eq_23.$$arity = 1);
    Opal.defn(self, '$abs', TMP_Number_abs_24 = function $$abs() {
      var self = this;

      return Math.abs(self)
    }, TMP_Number_abs_24.$$arity = 0);
    Opal.defn(self, '$abs2', TMP_Number_abs2_25 = function $$abs2() {
      var self = this;

      return Math.abs(self * self)
    }, TMP_Number_abs2_25.$$arity = 0);
    Opal.defn(self, '$angle', TMP_Number_angle_26 = function $$angle() {
      var $a, self = this;

      
      if ((($a = self['$nan?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self};
      
      if (self == 0) {
        if (1 / self > 0) {
          return 0;
        }
        else {
          return Math.PI;
        }
      }
      else if (self < 0) {
        return Math.PI;
      }
      else {
        return 0;
      }
    ;
    }, TMP_Number_angle_26.$$arity = 0);
    Opal.alias(self, "arg", "angle");
    Opal.alias(self, "phase", "angle");
    Opal.defn(self, '$bit_length', TMP_Number_bit_length_27 = function $$bit_length() {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'NoMethodError', true, true).$new("" + "undefined method `bit_length` for " + (self) + ":Float", "bit_length"))
      };
      
      if (self === 0 || self === -1) {
        return 0;
      }

      var result = 0,
          value  = self < 0 ? ~self : self;

      while (value != 0) {
        result   += 1;
        value  >>>= 1;
      }

      return result;
    ;
    }, TMP_Number_bit_length_27.$$arity = 0);
    Opal.defn(self, '$ceil', TMP_Number_ceil_28 = function $$ceil() {
      var self = this;

      return Math.ceil(self)
    }, TMP_Number_ceil_28.$$arity = 0);
    Opal.defn(self, '$chr', TMP_Number_chr_29 = function $$chr(encoding) {
      var self = this;

      return String.fromCharCode(self)
    }, TMP_Number_chr_29.$$arity = -1);
    Opal.defn(self, '$denominator', TMP_Number_denominator_30 = function $$denominator() {
      var $a, $b, self = this, $iter = TMP_Number_denominator_30.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Number_denominator_30.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil && $b != null) ? $b : self['$infinite?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 1
        } else {
        return $send(self, Opal.find_super_dispatcher(self, 'denominator', TMP_Number_denominator_30, false), $zuper, $iter)
      }
    }, TMP_Number_denominator_30.$$arity = 0);
    Opal.defn(self, '$downto', TMP_Number_downto_31 = function $$downto(stop) {
      var TMP_32, self = this, $iter = TMP_Number_downto_31.$$p, block = $iter || nil;

      TMP_Number_downto_31.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["downto", stop], (TMP_32 = function(){var self = TMP_32.$$s || this, $a;

        
          if ((($a = Opal.const_get($scopes, 'Numeric', true, true)['$==='](stop)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            } else {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
          };
          if ((($a = $rb_gt(stop, self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return 0
            } else {
            return $rb_plus($rb_minus(self, stop), 1)
          };}, TMP_32.$$s = self, TMP_32.$$arity = 0, TMP_32))
      };
      
      if (!stop.$$is_number) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
      }
      for (var i = self; i >= stop; i--) {
        block(i);
      }
    ;
      return self;
    }, TMP_Number_downto_31.$$arity = 1);
    Opal.alias(self, "eql?", "==");
    Opal.defn(self, '$equal?', TMP_Number_equal$q_33 = function(other) {
      var $a, self = this;

      return ((($a = self['$=='](other)) !== false && $a !== nil && $a != null) ? $a : isNaN(self) && isNaN(other))
    }, TMP_Number_equal$q_33.$$arity = 1);
    Opal.defn(self, '$even?', TMP_Number_even$q_34 = function() {
      var self = this;

      return self % 2 === 0
    }, TMP_Number_even$q_34.$$arity = 0);
    Opal.defn(self, '$floor', TMP_Number_floor_35 = function $$floor() {
      var self = this;

      return Math.floor(self)
    }, TMP_Number_floor_35.$$arity = 0);
    Opal.defn(self, '$gcd', TMP_Number_gcd_36 = function $$gcd(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "not an integer")
      };
      
      var min = Math.abs(self),
          max = Math.abs(other);

      while (min > 0) {
        var tmp = min;

        min = max % min;
        max = tmp;
      }

      return max;
    ;
    }, TMP_Number_gcd_36.$$arity = 1);
    Opal.defn(self, '$gcdlcm', TMP_Number_gcdlcm_37 = function $$gcdlcm(other) {
      var self = this;

      return [self.$gcd(), self.$lcm()]
    }, TMP_Number_gcdlcm_37.$$arity = 1);
    Opal.defn(self, '$integer?', TMP_Number_integer$q_38 = function() {
      var self = this;

      return self % 1 === 0
    }, TMP_Number_integer$q_38.$$arity = 0);
    Opal.defn(self, '$is_a?', TMP_Number_is_a$q_39 = function(klass) {
      var $a, $b, self = this, $iter = TMP_Number_is_a$q_39.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Number_is_a$q_39.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      
      if ((($a = (($b = klass['$=='](Opal.const_get($scopes, 'Fixnum', true, true))) ? Opal.const_get($scopes, 'Integer', true, true)['$==='](self) : klass['$=='](Opal.const_get($scopes, 'Fixnum', true, true)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$=='](Opal.const_get($scopes, 'Integer', true, true))) ? Opal.const_get($scopes, 'Integer', true, true)['$==='](self) : klass['$=='](Opal.const_get($scopes, 'Integer', true, true)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$=='](Opal.const_get($scopes, 'Float', true, true))) ? Opal.const_get($scopes, 'Float', true, true)['$==='](self) : klass['$=='](Opal.const_get($scopes, 'Float', true, true)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      return $send(self, Opal.find_super_dispatcher(self, 'is_a?', TMP_Number_is_a$q_39, false), $zuper, $iter);
    }, TMP_Number_is_a$q_39.$$arity = 1);
    Opal.alias(self, "kind_of?", "is_a?");
    Opal.defn(self, '$instance_of?', TMP_Number_instance_of$q_40 = function(klass) {
      var $a, $b, self = this, $iter = TMP_Number_instance_of$q_40.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Number_instance_of$q_40.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      
      if ((($a = (($b = klass['$=='](Opal.const_get($scopes, 'Fixnum', true, true))) ? Opal.const_get($scopes, 'Integer', true, true)['$==='](self) : klass['$=='](Opal.const_get($scopes, 'Fixnum', true, true)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$=='](Opal.const_get($scopes, 'Integer', true, true))) ? Opal.const_get($scopes, 'Integer', true, true)['$==='](self) : klass['$=='](Opal.const_get($scopes, 'Integer', true, true)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      if ((($a = (($b = klass['$=='](Opal.const_get($scopes, 'Float', true, true))) ? Opal.const_get($scopes, 'Float', true, true)['$==='](self) : klass['$=='](Opal.const_get($scopes, 'Float', true, true)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return true};
      return $send(self, Opal.find_super_dispatcher(self, 'instance_of?', TMP_Number_instance_of$q_40, false), $zuper, $iter);
    }, TMP_Number_instance_of$q_40.$$arity = 1);
    Opal.defn(self, '$lcm', TMP_Number_lcm_41 = function $$lcm(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "not an integer")
      };
      
      if (self == 0 || other == 0) {
        return 0;
      }
      else {
        return Math.abs(self * other / self.$gcd(other));
      }
    ;
    }, TMP_Number_lcm_41.$$arity = 1);
    Opal.alias(self, "magnitude", "abs");
    Opal.alias(self, "modulo", "%");
    Opal.defn(self, '$next', TMP_Number_next_42 = function $$next() {
      var self = this;

      return self + 1
    }, TMP_Number_next_42.$$arity = 0);
    Opal.defn(self, '$nonzero?', TMP_Number_nonzero$q_43 = function() {
      var self = this;

      return self == 0 ? nil : self
    }, TMP_Number_nonzero$q_43.$$arity = 0);
    Opal.defn(self, '$numerator', TMP_Number_numerator_44 = function $$numerator() {
      var $a, $b, self = this, $iter = TMP_Number_numerator_44.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Number_numerator_44.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil && $b != null) ? $b : self['$infinite?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self
        } else {
        return $send(self, Opal.find_super_dispatcher(self, 'numerator', TMP_Number_numerator_44, false), $zuper, $iter)
      }
    }, TMP_Number_numerator_44.$$arity = 0);
    Opal.defn(self, '$odd?', TMP_Number_odd$q_45 = function() {
      var self = this;

      return self % 2 !== 0
    }, TMP_Number_odd$q_45.$$arity = 0);
    Opal.defn(self, '$ord', TMP_Number_ord_46 = function $$ord() {
      var self = this;

      return self
    }, TMP_Number_ord_46.$$arity = 0);
    Opal.defn(self, '$pred', TMP_Number_pred_47 = function $$pred() {
      var self = this;

      return self - 1
    }, TMP_Number_pred_47.$$arity = 0);
    Opal.defn(self, '$quo', TMP_Number_quo_48 = function $$quo(other) {
      var $a, self = this, $iter = TMP_Number_quo_48.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Number_quo_48.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $send(self, Opal.find_super_dispatcher(self, 'quo', TMP_Number_quo_48, false), $zuper, $iter)
        } else {
        return $rb_divide(self, other)
      }
    }, TMP_Number_quo_48.$$arity = 1);
    Opal.defn(self, '$rationalize', TMP_Number_rationalize_49 = function $$rationalize(eps) {
      var $a, $b, self = this, f = nil, n = nil;

      
      
      if (arguments.length > 1) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (arguments.length) + " for 0..1)");
      }
    ;
      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Opal.const_get($scopes, 'Rational', true, true).$new(self, 1)
      } else if ((($a = self['$infinite?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise(Opal.const_get($scopes, 'FloatDomainError', true, true), "Infinity")
      } else if ((($a = self['$nan?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise(Opal.const_get($scopes, 'FloatDomainError', true, true), "NaN")
      } else if ((($a = eps == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        $b = Opal.const_get($scopes, 'Math', true, true).$frexp(self), $a = Opal.to_ary($b), (f = ($a[0] == null ? nil : $a[0])), (n = ($a[1] == null ? nil : $a[1])), $b;
        f = Opal.const_get($scopes, 'Math', true, true).$ldexp(f, Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'MANT_DIG', true, true)).$to_i();
        (n = $rb_minus(n, Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'MANT_DIG', true, true)));
        return Opal.const_get($scopes, 'Rational', true, true).$new($rb_times(2, f), (1)['$<<']($rb_minus(1, n))).$rationalize(Opal.const_get($scopes, 'Rational', true, true).$new(1, (1)['$<<']($rb_minus(1, n))));
        } else {
        return self.$to_r().$rationalize(eps)
      };
    }, TMP_Number_rationalize_49.$$arity = -1);
    Opal.defn(self, '$round', TMP_Number_round_50 = function $$round(ndigits) {
      var $a, $b, self = this, _ = nil, exp = nil;

      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        if ((($a = ndigits == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self};
        if ((($a = ($b = Opal.const_get($scopes, 'Float', true, true)['$==='](ndigits), $b !== false && $b !== nil && $b != null ?ndigits['$infinite?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "Infinity")};
        ndigits = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](ndigits, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($a = $rb_lt(ndigits, Opal.const_get([Opal.const_get($scopes, 'Integer', true, true).$$scope], 'MIN', true, true))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "out of bounds")};
        if ((($a = ndigits >= 0) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self};
        ndigits = ndigits['$-@']();
        
        if (0.415241 * ndigits - 0.125 > self.$size()) {
          return 0;
        }

        var f = Math.pow(10, ndigits),
            x = Math.floor((Math.abs(x) + f / 2) / f) * f;

        return self < 0 ? -x : x;
      ;
        } else {
        
        if ((($a = ($b = self['$nan?'](), $b !== false && $b !== nil && $b != null ?ndigits == null : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'FloatDomainError', true, true), "NaN")};
        ndigits = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](ndigits || 0, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if ((($a = $rb_le(ndigits, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          if ((($a = self['$nan?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "NaN")
          } else if ((($a = self['$infinite?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            self.$raise(Opal.const_get($scopes, 'FloatDomainError', true, true), "Infinity")}
        } else if (ndigits['$=='](0)) {
          return Math.round(self)
        } else if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil && $b != null) ? $b : self['$infinite?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self};
        $b = Opal.const_get($scopes, 'Math', true, true).$frexp(self), $a = Opal.to_ary($b), (_ = ($a[0] == null ? nil : $a[0])), (exp = ($a[1] == null ? nil : $a[1])), $b;
        if ((($a = $rb_ge(ndigits, $rb_minus($rb_plus(Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'DIG', true, true), 2), (function() {if ((($b = $rb_gt(exp, 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return $rb_divide(exp, 4)
          } else {
          return $rb_minus($rb_divide(exp, 3), 1)
        }; return nil; })()))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self};
        if ((($a = $rb_lt(ndigits, (function() {if ((($b = $rb_gt(exp, 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return $rb_plus($rb_divide(exp, 3), 1)
          } else {
          return $rb_divide(exp, 4)
        }; return nil; })()['$-@']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return 0};
        return Math.round(self * Math.pow(10, ndigits)) / Math.pow(10, ndigits);
      }
    }, TMP_Number_round_50.$$arity = -1);
    Opal.defn(self, '$step', TMP_Number_step_51 = function $$step($limit, $step, $kwargs) {
      var $a, $b, TMP_52, self = this, $post_args, to, by, limit, step, $iter = TMP_Number_step_51.$$p, block = $iter || nil;

      $post_args = Opal.slice.call(arguments, 0, arguments.length);
      $kwargs = Opal.extract_kwargs($post_args);
      if ($kwargs == null || !$kwargs.$$is_hash) {
        if ($kwargs == null) {
          $kwargs = $hash2([], {});
        } else {
          throw Opal.ArgumentError.$new('expected kwargs');
        }
      }
      if ((to = $kwargs.$$smap['to']) == null) {
        to = nil
      }
      if ((by = $kwargs.$$smap['by']) == null) {
        by = nil
      }
      if (0 < $post_args.length) {
        limit = $post_args.splice(0,1)[0];
      }
      if (limit == null) {
        limit = nil;
      }
      if (0 < $post_args.length) {
        step = $post_args.splice(0,1)[0];
      }
      if (step == null) {
        step = nil;
      }
      TMP_Number_step_51.$$p = null;
      
      
      if (limit !== nil && to !== nil) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "to is given twice")
      }

      if (step !== nil && by !== nil) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "step is given twice")
      }

      function validateParameters() {
        if (step === 0) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "step cannot be 0")
        }

        ((($a = limit) !== false && $a !== nil && $a != null) ? $a : (limit = to));
        ((($a = step) !== false && $a !== nil && $a != null) ? $a : (step = ((($b = by) !== false && $b !== nil && $b != null) ? $b : 1)));

        if (!limit.$$is_number) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "limit must be a number")
        }

        if (!step.$$is_number) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "step must be a number")
        }
      }

      function stepFloatSize() {
        if ((step > 0 && self > limit) || (step < 0 && self < limit)) {
          return 0;
        } else if (step === Infinity || step === -Infinity) {
          return 1;
        } else {
          var abs = Math.abs, floor = Math.floor,
              err = (abs(self) + abs(limit) + abs(limit - self)) / abs(step) * Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'EPSILON', true, true);

          if (err === Infinity || err === -Infinity) {
            return 0;
          } else {
            if (err > 0.5) {
              err = 0.5;
            }

            return floor((limit - self) / step + err) + 1
          }
        }
      }

      function stepSize() {
        validateParameters();

        if (step === 0) {
          return Infinity;
        }

        if (step % 1 !== 0) {
          return stepFloatSize();
        } else if ((step > 0 && self > limit) || (step < 0 && self < limit)) {
          return 0;
        } else {
          var ceil = Math.ceil, abs = Math.abs,
              lhs = abs(self - limit) + 1,
              rhs = abs(step);

          return ceil(lhs / rhs);
        }
      }
    ;
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["step", limit, step, $hash2(["to", "by"], {"to": to, "by": by})], (TMP_52 = function(){var self = TMP_52.$$s || this;

        return stepSize()}, TMP_52.$$s = self, TMP_52.$$arity = 0, TMP_52))
      };
      
      validateParameters();

      if (step === 0) {
        while (true) {
          block(self);
        }
      }

      if (self % 1 !== 0 || limit % 1 !== 0 || step % 1 !== 0) {
        var n = stepFloatSize();

        if (n > 0) {
          if (step === Infinity || step === -Infinity) {
            block(self);
          } else {
            var i = 0, d;

            if (step > 0) {
              while (i < n) {
                d = i * step + self;
                if (limit < d) {
                  d = limit;
                }
                block(d);
                i += 1;
              }
            } else {
              while (i < n) {
                d = i * step + self;
                if (limit > d) {
                  d = limit;
                }
                block(d);
                i += 1
              }
            }
          }
        }
      } else {
        var value = self;

        if (step > 0) {
          while (value <= limit) {
            block(value);
            value += step;
          }
        } else {
          while (value >= limit) {
            block(value);
            value += step
          }
        }
      }

      return self;
    ;
    }, TMP_Number_step_51.$$arity = -1);
    Opal.alias(self, "succ", "next");
    Opal.defn(self, '$times', TMP_Number_times_53 = function $$times() {
      var TMP_54, self = this, $iter = TMP_Number_times_53.$$p, block = $iter || nil;

      TMP_Number_times_53.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        return $send(self, 'enum_for', ["times"], (TMP_54 = function(){var self = TMP_54.$$s || this;

        return self}, TMP_54.$$s = self, TMP_54.$$arity = 0, TMP_54))
      };
      
      for (var i = 0; i < self; i++) {
        block(i);
      }
    ;
      return self;
    }, TMP_Number_times_53.$$arity = 0);
    Opal.defn(self, '$to_f', TMP_Number_to_f_55 = function $$to_f() {
      var self = this;

      return self
    }, TMP_Number_to_f_55.$$arity = 0);
    Opal.defn(self, '$to_i', TMP_Number_to_i_56 = function $$to_i() {
      var self = this;

      return parseInt(self, 10)
    }, TMP_Number_to_i_56.$$arity = 0);
    Opal.alias(self, "to_int", "to_i");
    Opal.defn(self, '$to_r', TMP_Number_to_r_57 = function $$to_r() {
      var $a, $b, self = this, f = nil, e = nil;

      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Opal.const_get($scopes, 'Rational', true, true).$new(self, 1)
        } else {
        
        $b = Opal.const_get($scopes, 'Math', true, true).$frexp(self), $a = Opal.to_ary($b), (f = ($a[0] == null ? nil : $a[0])), (e = ($a[1] == null ? nil : $a[1])), $b;
        f = Opal.const_get($scopes, 'Math', true, true).$ldexp(f, Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'MANT_DIG', true, true)).$to_i();
        (e = $rb_minus(e, Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'MANT_DIG', true, true)));
        return $rb_times(f, Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'RADIX', true, true)['$**'](e)).$to_r();
      }
    }, TMP_Number_to_r_57.$$arity = 0);
    Opal.defn(self, '$to_s', TMP_Number_to_s_58 = function $$to_s(base) {
      var $a, $b, self = this;

      if (base == null) {
        base = 10;
      }
      
      if ((($a = ((($b = $rb_lt(base, 2)) !== false && $b !== nil && $b != null) ? $b : $rb_gt(base, 36))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "base must be between 2 and 36")};
      return self.toString(base);
    }, TMP_Number_to_s_58.$$arity = -1);
    Opal.alias(self, "truncate", "to_i");
    Opal.alias(self, "inspect", "to_s");
    Opal.defn(self, '$divmod', TMP_Number_divmod_59 = function $$divmod(other) {
      var $a, $b, self = this, $iter = TMP_Number_divmod_59.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Number_divmod_59.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      if ((($a = ((($b = self['$nan?']()) !== false && $b !== nil && $b != null) ? $b : other['$nan?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise(Opal.const_get($scopes, 'FloatDomainError', true, true), "NaN")
      } else if ((($a = self['$infinite?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise(Opal.const_get($scopes, 'FloatDomainError', true, true), "Infinity")
        } else {
        return $send(self, Opal.find_super_dispatcher(self, 'divmod', TMP_Number_divmod_59, false), $zuper, $iter)
      }
    }, TMP_Number_divmod_59.$$arity = 1);
    Opal.defn(self, '$upto', TMP_Number_upto_60 = function $$upto(stop) {
      var TMP_61, self = this, $iter = TMP_Number_upto_60.$$p, block = $iter || nil;

      TMP_Number_upto_60.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return $send(self, 'enum_for', ["upto", stop], (TMP_61 = function(){var self = TMP_61.$$s || this, $a;

        
          if ((($a = Opal.const_get($scopes, 'Numeric', true, true)['$==='](stop)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            } else {
            self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
          };
          if ((($a = $rb_lt(stop, self)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return 0
            } else {
            return $rb_plus($rb_minus(stop, self), 1)
          };}, TMP_61.$$s = self, TMP_61.$$arity = 0, TMP_61))
      };
      
      if (!stop.$$is_number) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "comparison of " + (self.$class()) + " with " + (stop.$class()) + " failed")
      }
      for (var i = self; i <= stop; i++) {
        block(i);
      }
    ;
      return self;
    }, TMP_Number_upto_60.$$arity = 1);
    Opal.defn(self, '$zero?', TMP_Number_zero$q_62 = function() {
      var self = this;

      return self == 0
    }, TMP_Number_zero$q_62.$$arity = 0);
    Opal.defn(self, '$size', TMP_Number_size_63 = function $$size() {
      var self = this;

      return 4
    }, TMP_Number_size_63.$$arity = 0);
    Opal.defn(self, '$nan?', TMP_Number_nan$q_64 = function() {
      var self = this;

      return isNaN(self)
    }, TMP_Number_nan$q_64.$$arity = 0);
    Opal.defn(self, '$finite?', TMP_Number_finite$q_65 = function() {
      var self = this;

      return self != Infinity && self != -Infinity && !isNaN(self)
    }, TMP_Number_finite$q_65.$$arity = 0);
    Opal.defn(self, '$infinite?', TMP_Number_infinite$q_66 = function() {
      var self = this;

      
      if (self == Infinity) {
        return +1;
      }
      else if (self == -Infinity) {
        return -1;
      }
      else {
        return nil;
      }
    
    }, TMP_Number_infinite$q_66.$$arity = 0);
    Opal.defn(self, '$positive?', TMP_Number_positive$q_67 = function() {
      var self = this;

      return self != 0 && (self == Infinity || 1 / self > 0)
    }, TMP_Number_positive$q_67.$$arity = 0);
    return (Opal.defn(self, '$negative?', TMP_Number_negative$q_68 = function() {
      var self = this;

      return self == -Infinity || 1 / self < 0
    }, TMP_Number_negative$q_68.$$arity = 0), nil) && 'negative?';
  })($scope.base, Opal.const_get($scopes, 'Numeric', true, true), $scopes);
  Opal.cdecl($scope, 'Fixnum', Opal.const_get($scopes, 'Number', true, true));
  (function($base, $super, $visibility_scopes) {
    function $Integer(){};
    var self = $Integer = $klass($base, $super, 'Integer', $Integer);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Integer_$eq$eq$eq_69;

    
    self.$$is_number_class = true;
    Opal.defs(self, '$===', TMP_Integer_$eq$eq$eq_69 = function(other) {
      var self = this;

      
      if (!other.$$is_number) {
        return false;
      }

      return (other % 1) === 0;
    
    }, TMP_Integer_$eq$eq$eq_69.$$arity = 1);
    Opal.cdecl($scope, 'MAX', Math.pow(2, 30) - 1);
    return Opal.cdecl($scope, 'MIN', -Math.pow(2, 30));
  })($scope.base, Opal.const_get($scopes, 'Numeric', true, true), $scopes);
  return (function($base, $super, $visibility_scopes) {
    function $Float(){};
    var self = $Float = $klass($base, $super, 'Float', $Float);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Float_$eq$eq$eq_70;

    
    self.$$is_number_class = true;
    Opal.defs(self, '$===', TMP_Float_$eq$eq$eq_70 = function(other) {
      var self = this;

      return !!other.$$is_number
    }, TMP_Float_$eq$eq$eq_70.$$arity = 1);
    Opal.cdecl($scope, 'INFINITY', Infinity);
    Opal.cdecl($scope, 'MAX', Number.MAX_VALUE);
    Opal.cdecl($scope, 'MIN', Number.MIN_VALUE);
    Opal.cdecl($scope, 'NAN', NaN);
    Opal.cdecl($scope, 'DIG', 15);
    Opal.cdecl($scope, 'MANT_DIG', 53);
    Opal.cdecl($scope, 'RADIX', 2);
    return Opal.cdecl($scope, 'EPSILON', Number.EPSILON || 2.2204460492503130808472633361816E-16);
  })($scope.base, Opal.const_get($scopes, 'Numeric', true, true), $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/range"] = function(Opal) {
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send;

  Opal.add_stubs(['$require', '$include', '$attr_reader', '$raise', '$<=>', '$include?', '$<=', '$<', '$enum_for', '$upto', '$to_proc', '$respond_to?', '$class', '$succ', '$!', '$==', '$===', '$exclude_end?', '$eql?', '$begin', '$end', '$last', '$to_a', '$>', '$-', '$abs', '$to_i', '$coerce_to!', '$ceil', '$/', '$size', '$loop', '$+', '$*', '$>=', '$each_with_index', '$%', '$bsearch', '$inspect', '$[]', '$hash']);
  
  self.$require("corelib/enumerable");
  return (function($base, $super, $visibility_scopes) {
    function $Range(){};
    var self = $Range = $klass($base, $super, 'Range', $Range);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Range_initialize_1, TMP_Range_$eq$eq_2, TMP_Range_$eq$eq$eq_3, TMP_Range_cover$q_4, TMP_Range_each_5, TMP_Range_eql$q_6, TMP_Range_exclude_end$q_7, TMP_Range_first_8, TMP_Range_last_9, TMP_Range_max_10, TMP_Range_min_11, TMP_Range_size_12, TMP_Range_step_13, TMP_Range_bsearch_17, TMP_Range_to_s_18, TMP_Range_inspect_19, TMP_Range_marshal_load_20, TMP_Range_hash_21;

    def.begin = def.end = def.exclude = nil;
    
    self.$include(Opal.const_get($scopes, 'Enumerable', true, true));
    def.$$is_range = true;;
    self.$attr_reader("begin", "end");
    Opal.defn(self, '$initialize', TMP_Range_initialize_1 = function $$initialize(first, last, exclude) {
      var $a, self = this;

      if (exclude == null) {
        exclude = false;
      }
      
      if ((($a = self.begin) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'NameError', true, true), "'initialize' called twice")};
      if ((($a = first['$<=>'](last)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "bad value for range")
      };
      self.begin = first;
      self.end = last;
      return (self.exclude = exclude);
    }, TMP_Range_initialize_1.$$arity = -3);
    Opal.defn(self, '$==', TMP_Range_$eq$eq_2 = function(other) {
      var self = this;

      
      if (!other.$$is_range) {
        return false;
      }

      return self.exclude === other.exclude &&
             self.begin   ==  other.begin &&
             self.end     ==  other.end;
    
    }, TMP_Range_$eq$eq_2.$$arity = 1);
    Opal.defn(self, '$===', TMP_Range_$eq$eq$eq_3 = function(value) {
      var self = this;

      return self['$include?'](value)
    }, TMP_Range_$eq$eq$eq_3.$$arity = 1);
    Opal.defn(self, '$cover?', TMP_Range_cover$q_4 = function(value) {
      var $a, $b, self = this, beg_cmp = nil, end_cmp = nil;

      
      beg_cmp = self.begin['$<=>'](value);
      if ((($a = (($b = beg_cmp !== false && beg_cmp !== nil && beg_cmp != null) ? $rb_le(beg_cmp, 0) : beg_cmp)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      end_cmp = value['$<=>'](self.end);
      if ((($a = self.exclude) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return (($a = end_cmp !== false && end_cmp !== nil && end_cmp != null) ? $rb_lt(end_cmp, 0) : end_cmp)
        } else {
        return (($a = end_cmp !== false && end_cmp !== nil && end_cmp != null) ? $rb_le(end_cmp, 0) : end_cmp)
      };
    }, TMP_Range_cover$q_4.$$arity = 1);
    Opal.defn(self, '$each', TMP_Range_each_5 = function $$each() {
      var $a, $b, self = this, $iter = TMP_Range_each_5.$$p, block = $iter || nil, current = nil, last = nil;

      TMP_Range_each_5.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return self.$enum_for("each")
      };
      
      var i, limit;

      if (self.begin.$$is_number && self.end.$$is_number) {
        if (self.begin % 1 !== 0 || self.end % 1 !== 0) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "can't iterate from Float")
        }

        for (i = self.begin, limit = self.end + (function() {if ((($a = self.exclude) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 0
        } else {
        return 1
      }; return nil; })(); i < limit; i++) {
          block(i);
        }

        return self;
      }

      if (self.begin.$$is_string && self.end.$$is_string) {
        $send(self.begin, 'upto', [self.end, self.exclude], block.$to_proc())
        return self;
      }
    ;
      current = self.begin;
      last = self.end;
      if ((($a = current['$respond_to?']("succ")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't iterate from " + (current.$class()))
      };
      while ((($b = $rb_lt(current['$<=>'](last), 0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
      
      Opal.yield1(block, current);
      current = current.$succ();};
      if ((($a = ($b = self.exclude['$!'](), $b !== false && $b !== nil && $b != null ?current['$=='](last) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        Opal.yield1(block, current)};
      return self;
    }, TMP_Range_each_5.$$arity = 0);
    Opal.defn(self, '$eql?', TMP_Range_eql$q_6 = function(other) {
      var $a, $b, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Range', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      return ($a = ($b = self.exclude['$==='](other['$exclude_end?']()), $b !== false && $b !== nil && $b != null ?self.begin['$eql?'](other.$begin()) : $b), $a !== false && $a !== nil && $a != null ?self.end['$eql?'](other.$end()) : $a);
    }, TMP_Range_eql$q_6.$$arity = 1);
    Opal.defn(self, '$exclude_end?', TMP_Range_exclude_end$q_7 = function() {
      var self = this;

      return self.exclude
    }, TMP_Range_exclude_end$q_7.$$arity = 0);
    Opal.defn(self, '$first', TMP_Range_first_8 = function $$first(n) {
      var $a, self = this, $iter = TMP_Range_first_8.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Range_first_8.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      
      if ((($a = n == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.begin};
      return $send(self, Opal.find_super_dispatcher(self, 'first', TMP_Range_first_8, false), $zuper, $iter);
    }, TMP_Range_first_8.$$arity = -1);
    Opal.alias(self, "include?", "cover?");
    Opal.defn(self, '$last', TMP_Range_last_9 = function $$last(n) {
      var $a, self = this;

      
      if ((($a = n == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.end};
      return self.$to_a().$last(n);
    }, TMP_Range_last_9.$$arity = -1);
    Opal.defn(self, '$max', TMP_Range_max_10 = function $$max() {
      var $a, $b, self = this, $iter = TMP_Range_max_10.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Range_max_10.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      if (($yield !== nil)) {
        return $send(self, Opal.find_super_dispatcher(self, 'max', TMP_Range_max_10, false), $zuper, $iter)
      } else if ((($a = $rb_gt(self.begin, self.end)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
      } else if ((($a = ($b = self.exclude, $b !== false && $b !== nil && $b != null ?self.begin['$=='](self.end) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return self.exclude ? self.end - 1 : self.end
      }
    }, TMP_Range_max_10.$$arity = 0);
    Opal.alias(self, "member?", "cover?");
    Opal.defn(self, '$min', TMP_Range_min_11 = function $$min() {
      var $a, $b, self = this, $iter = TMP_Range_min_11.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Range_min_11.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      if (($yield !== nil)) {
        return $send(self, Opal.find_super_dispatcher(self, 'min', TMP_Range_min_11, false), $zuper, $iter)
      } else if ((($a = $rb_gt(self.begin, self.end)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
      } else if ((($a = ($b = self.exclude, $b !== false && $b !== nil && $b != null ?self.begin['$=='](self.end) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return nil
        } else {
        return self.begin
      }
    }, TMP_Range_min_11.$$arity = 0);
    Opal.defn(self, '$size', TMP_Range_size_12 = function $$size() {
      var $a, $b, self = this, _begin = nil, _end = nil, infinity = nil;

      
      _begin = self.begin;
      _end = self.end;
      if ((($a = self.exclude) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        (_end = $rb_minus(_end, 1))};
      if ((($a = ($b = Opal.const_get($scopes, 'Numeric', true, true)['$==='](_begin), $b !== false && $b !== nil && $b != null ?Opal.const_get($scopes, 'Numeric', true, true)['$==='](_end) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return nil
      };
      if ((($a = $rb_lt(_end, _begin)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return 0};
      infinity = Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'INFINITY', true, true);
      if ((($a = ((($b = infinity['$=='](_begin.$abs())) !== false && $b !== nil && $b != null) ? $b : _end.$abs()['$=='](infinity))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return infinity};
      return (Math.abs(_end - _begin) + 1).$to_i();
    }, TMP_Range_size_12.$$arity = 0);
    Opal.defn(self, '$step', TMP_Range_step_13 = function $$step(n) {
      var TMP_14, $a, TMP_15, TMP_16, self = this, $iter = TMP_Range_step_13.$$p, $yield = $iter || nil, i = nil;

      if (n == null) {
        n = 1;
      }
      TMP_Range_step_13.$$p = null;
      
      
      function coerceStepSize() {
        if (!n.$$is_number) {
          n = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](n, Opal.const_get($scopes, 'Integer', true, true), "to_int")
        }

        if (n < 0) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "step can't be negative")
        } else if (n === 0) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "step can't be 0")
        }
      }

      function enumeratorSize() {
        if (!self.begin['$respond_to?']("succ")) {
          return nil;
        }

        if (self.begin.$$is_string && self.end.$$is_string) {
          return nil;
        }

        if (n % 1 === 0) {
          return $rb_divide(self.$size(), n).$ceil();
        } else {
          // n is a float
          var begin = self.begin, end = self.end,
              abs = Math.abs, floor = Math.floor,
              err = (abs(begin) + abs(end) + abs(end - begin)) / abs(n) * Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'EPSILON', true, true),
              size;

          if (err > 0.5) {
            err = 0.5;
          }

          if (self.exclude) {
            size = floor((end - begin) / n - err);
            if (size * n + begin < end) {
              size++;
            }
          } else {
            size = floor((end - begin) / n + err) + 1
          }

          return size;
        }
      }
    ;
      if (($yield !== nil)) {
        } else {
        return $send(self, 'enum_for', ["step", n], (TMP_14 = function(){var self = TMP_14.$$s || this;

        
          coerceStepSize();
          return enumeratorSize();
        }, TMP_14.$$s = self, TMP_14.$$arity = 0, TMP_14))
      };
      coerceStepSize();
      if ((($a = self.begin.$$is_number && self.end.$$is_number) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        i = 0;
        (function(){var $brk = Opal.new_brk(); try {return $send(self, 'loop', [], (TMP_15 = function(){var self = TMP_15.$$s || this, $b, current = nil;
          if (self.begin == null) self.begin = nil;
          if (self.exclude == null) self.exclude = nil;
          if (self.end == null) self.end = nil;

        
          current = $rb_plus(self.begin, $rb_times(i, n));
          if ((($b = self.exclude) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            if ((($b = $rb_ge(current, self.end)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
              
              Opal.brk(nil, $brk)}
          } else if ((($b = $rb_gt(current, self.end)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
            
            Opal.brk(nil, $brk)};
          Opal.yield1($yield, current);
          return (i = $rb_plus(i, 1));}, TMP_15.$$s = self, TMP_15.$$brk = $brk, TMP_15.$$arity = 0, TMP_15))
        } catch (err) { if (err === $brk) { return err.$v } else { throw err } }})();
        } else {
        
        
        if (self.begin.$$is_string && self.end.$$is_string && n % 1 !== 0) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "no implicit conversion to float from string")
        }
      ;
        $send(self, 'each_with_index', [], (TMP_16 = function(value, idx){var self = TMP_16.$$s || this;
if (value == null) value = nil;if (idx == null) idx = nil;
        if (idx['$%'](n)['$=='](0)) {
            return Opal.yield1($yield, value);
            } else {
            return nil
          }}, TMP_16.$$s = self, TMP_16.$$arity = 2, TMP_16));
      };
      return self;
    }, TMP_Range_step_13.$$arity = -1);
    Opal.defn(self, '$bsearch', TMP_Range_bsearch_17 = function $$bsearch() {
      var $a, self = this, $iter = TMP_Range_bsearch_17.$$p, block = $iter || nil;

      TMP_Range_bsearch_17.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return self.$enum_for("bsearch")
      };
      if ((($a = self.begin.$$is_number && self.end.$$is_number) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't do binary search for " + (self.begin.$class()))
      };
      return $send(self.$to_a(), 'bsearch', [], block.$to_proc());
    }, TMP_Range_bsearch_17.$$arity = 0);
    Opal.defn(self, '$to_s', TMP_Range_to_s_18 = function $$to_s() {
      var $a, self = this;

      return "" + (self.begin) + ((function() {if ((($a = self.exclude) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "..."
        } else {
        return ".."
      }; return nil; })()) + (self.end)
    }, TMP_Range_to_s_18.$$arity = 0);
    Opal.defn(self, '$inspect', TMP_Range_inspect_19 = function $$inspect() {
      var $a, self = this;

      return "" + (self.begin.$inspect()) + ((function() {if ((($a = self.exclude) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return "..."
        } else {
        return ".."
      }; return nil; })()) + (self.end.$inspect())
    }, TMP_Range_inspect_19.$$arity = 0);
    Opal.defn(self, '$marshal_load', TMP_Range_marshal_load_20 = function $$marshal_load(args) {
      var self = this;

      
      self.begin = args['$[]']("begin");
      self.end = args['$[]']("end");
      return (self.exclude = args['$[]']("excl"));
    }, TMP_Range_marshal_load_20.$$arity = 1);
    return (Opal.defn(self, '$hash', TMP_Range_hash_21 = function $$hash() {
      var self = this;

      return [self.begin, self.end, self.exclude].$hash()
    }, TMP_Range_hash_21.$$arity = 0), nil) && 'hash';
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/proc"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$raise', '$coerce_to!']);
  return (function($base, $super, $visibility_scopes) {
    function $Proc(){};
    var self = $Proc = $klass($base, $super, 'Proc', $Proc);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Proc_new_1, TMP_Proc_call_2, TMP_Proc_to_proc_3, TMP_Proc_lambda$q_4, TMP_Proc_arity_5, TMP_Proc_source_location_6, TMP_Proc_binding_7, TMP_Proc_parameters_8, TMP_Proc_curry_9, TMP_Proc_dup_10;

    
    def.$$is_proc = true;
    def.$$is_lambda = false;
    Opal.defs(self, '$new', TMP_Proc_new_1 = function() {
      var self = this, $iter = TMP_Proc_new_1.$$p, block = $iter || nil;

      TMP_Proc_new_1.$$p = null;
      
      if (block !== false && block !== nil && block != null) {
        } else {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "tried to create a Proc object without a block")
      };
      return block;
    }, TMP_Proc_new_1.$$arity = 0);
    Opal.defn(self, '$call', TMP_Proc_call_2 = function $$call($a_rest) {
      var self = this, args, $iter = TMP_Proc_call_2.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Proc_call_2.$$p = null;
      
      if (block !== nil) {
        self.$$p = block;
      }

      var result, $brk = self.$$brk;

      if ($brk) {
        try {
          if (self.$$is_lambda) {
            result = self.apply(null, args);
          }
          else {
            result = Opal.yieldX(self, args);
          }
        } catch (err) {
          if (err === $brk) {
            return $brk.$v
          }
          else {
            throw err
          }
        }
      }
      else {
        if (self.$$is_lambda) {
          result = self.apply(null, args);
        }
        else {
          result = Opal.yieldX(self, args);
        }
      }

      return result;
    
    }, TMP_Proc_call_2.$$arity = -1);
    Opal.alias(self, "[]", "call");
    Opal.alias(self, "===", "call");
    Opal.alias(self, "yield", "call");
    Opal.defn(self, '$to_proc', TMP_Proc_to_proc_3 = function $$to_proc() {
      var self = this;

      return self
    }, TMP_Proc_to_proc_3.$$arity = 0);
    Opal.defn(self, '$lambda?', TMP_Proc_lambda$q_4 = function() {
      var self = this;

      return !!self.$$is_lambda
    }, TMP_Proc_lambda$q_4.$$arity = 0);
    Opal.defn(self, '$arity', TMP_Proc_arity_5 = function $$arity() {
      var self = this;

      
      if (self.$$is_curried) {
        return -1;
      } else {
        return self.$$arity;
      }
    
    }, TMP_Proc_arity_5.$$arity = 0);
    Opal.defn(self, '$source_location', TMP_Proc_source_location_6 = function $$source_location() {
      var self = this;

      
      if (self.$$is_curried) { return nil; };
      return nil;
    }, TMP_Proc_source_location_6.$$arity = 0);
    Opal.defn(self, '$binding', TMP_Proc_binding_7 = function $$binding() {
      var self = this;

      
      if (self.$$is_curried) { self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "Can't create Binding") };
      return nil;
    }, TMP_Proc_binding_7.$$arity = 0);
    Opal.defn(self, '$parameters', TMP_Proc_parameters_8 = function $$parameters() {
      var self = this;

      
      if (self.$$is_curried) {
        return [["rest"]];
      } else if (self.$$parameters) {
        if (self.$$is_lambda) {
          return self.$$parameters;
        } else {
          var result = [], i, length;

          for (i = 0, length = self.$$parameters.length; i < length; i++) {
            var parameter = self.$$parameters[i];

            if (parameter[0] === 'req') {
              // required arguments always have name
              parameter = ['opt', parameter[1]];
            }

            result.push(parameter);
          }

          return result;
        }
      } else {
        return [];
      }
    
    }, TMP_Proc_parameters_8.$$arity = 0);
    Opal.defn(self, '$curry', TMP_Proc_curry_9 = function $$curry(arity) {
      var self = this;

      
      if (arity === undefined) {
        arity = self.length;
      }
      else {
        arity = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](arity, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        if (self.$$is_lambda && arity !== self.length) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (arity) + " for " + (self.length) + ")")
        }
      }

      function curried () {
        var args = $slice.call(arguments),
            length = args.length,
            result;

        if (length > arity && self.$$is_lambda && !self.$$is_curried) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (length) + " for " + (arity) + ")")
        }

        if (length >= arity) {
          return self.$call.apply(self, args);
        }

        result = function () {
          return curried.apply(null,
            args.concat($slice.call(arguments)));
        }
        result.$$is_lambda = self.$$is_lambda;
        result.$$is_curried = true;

        return result;
      };

      curried.$$is_lambda = self.$$is_lambda;
      curried.$$is_curried = true;
      return curried;
    
    }, TMP_Proc_curry_9.$$arity = -1);
    Opal.defn(self, '$dup', TMP_Proc_dup_10 = function $$dup() {
      var self = this;

      
      var original_proc = self.$$original_proc || self,
          proc = function () {
            return original_proc.apply(this, arguments);
          };

      for (var prop in self) {
        if (self.hasOwnProperty(prop)) {
          proc[prop] = self[prop];
        }
      }

      return proc;
    
    }, TMP_Proc_dup_10.$$arity = 0);
    return Opal.alias(self, "clone", "dup");
  })($scope.base, Function, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/method"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$attr_reader', '$arity', '$new', '$class', '$join', '$source_location', '$raise']);
  
  (function($base, $super, $visibility_scopes) {
    function $Method(){};
    var self = $Method = $klass($base, $super, 'Method', $Method);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Method_initialize_1, TMP_Method_arity_2, TMP_Method_parameters_3, TMP_Method_source_location_4, TMP_Method_comments_5, TMP_Method_call_6, TMP_Method_unbind_7, TMP_Method_to_proc_8, TMP_Method_inspect_9;

    def.method = def.receiver = def.owner = def.name = nil;
    
    self.$attr_reader("owner", "receiver", "name");
    Opal.defn(self, '$initialize', TMP_Method_initialize_1 = function $$initialize(receiver, owner, method, name) {
      var self = this;

      
      self.receiver = receiver;
      self.owner = owner;
      self.name = name;
      return (self.method = method);
    }, TMP_Method_initialize_1.$$arity = 4);
    Opal.defn(self, '$arity', TMP_Method_arity_2 = function $$arity() {
      var self = this;

      return self.method.$arity()
    }, TMP_Method_arity_2.$$arity = 0);
    Opal.defn(self, '$parameters', TMP_Method_parameters_3 = function $$parameters() {
      var self = this;

      return self.method.$$parameters
    }, TMP_Method_parameters_3.$$arity = 0);
    Opal.defn(self, '$source_location', TMP_Method_source_location_4 = function $$source_location() {
      var $a, self = this;

      return ((($a = self.method.$$source_location) !== false && $a !== nil && $a != null) ? $a : ["(eval)", 0])
    }, TMP_Method_source_location_4.$$arity = 0);
    Opal.defn(self, '$comments', TMP_Method_comments_5 = function $$comments() {
      var $a, self = this;

      return ((($a = self.method.$$comments) !== false && $a !== nil && $a != null) ? $a : [])
    }, TMP_Method_comments_5.$$arity = 0);
    Opal.defn(self, '$call', TMP_Method_call_6 = function $$call($a_rest) {
      var self = this, args, $iter = TMP_Method_call_6.$$p, block = $iter || nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Method_call_6.$$p = null;
      
      self.method.$$p = block;

      return self.method.apply(self.receiver, args);
    
    }, TMP_Method_call_6.$$arity = -1);
    Opal.alias(self, "[]", "call");
    Opal.defn(self, '$unbind', TMP_Method_unbind_7 = function $$unbind() {
      var self = this;

      return Opal.const_get($scopes, 'UnboundMethod', true, true).$new(self.receiver.$class(), self.owner, self.method, self.name)
    }, TMP_Method_unbind_7.$$arity = 0);
    Opal.defn(self, '$to_proc', TMP_Method_to_proc_8 = function $$to_proc() {
      var self = this;

      
      var proc = self.$call.bind(self);
      proc.$$unbound = self.method;
      proc.$$is_lambda = true;
      return proc;
    
    }, TMP_Method_to_proc_8.$$arity = 0);
    return (Opal.defn(self, '$inspect', TMP_Method_inspect_9 = function $$inspect() {
      var self = this;

      return "" + "#<" + (self.$class()) + ": " + (self.receiver.$class()) + "#" + (self.name) + " (defined in " + (self.owner) + " in " + (self.$source_location().$join(":")) + ")>"
    }, TMP_Method_inspect_9.$$arity = 0), nil) && 'inspect';
  })($scope.base, null, $scopes);
  return (function($base, $super, $visibility_scopes) {
    function $UnboundMethod(){};
    var self = $UnboundMethod = $klass($base, $super, 'UnboundMethod', $UnboundMethod);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_UnboundMethod_initialize_10, TMP_UnboundMethod_arity_11, TMP_UnboundMethod_parameters_12, TMP_UnboundMethod_source_location_13, TMP_UnboundMethod_comments_14, TMP_UnboundMethod_bind_15, TMP_UnboundMethod_inspect_16;

    def.method = def.owner = def.name = def.source = nil;
    
    self.$attr_reader("source", "owner", "name");
    Opal.defn(self, '$initialize', TMP_UnboundMethod_initialize_10 = function $$initialize(source, owner, method, name) {
      var self = this;

      
      self.source = source;
      self.owner = owner;
      self.method = method;
      return (self.name = name);
    }, TMP_UnboundMethod_initialize_10.$$arity = 4);
    Opal.defn(self, '$arity', TMP_UnboundMethod_arity_11 = function $$arity() {
      var self = this;

      return self.method.$arity()
    }, TMP_UnboundMethod_arity_11.$$arity = 0);
    Opal.defn(self, '$parameters', TMP_UnboundMethod_parameters_12 = function $$parameters() {
      var self = this;

      return self.method.$$parameters
    }, TMP_UnboundMethod_parameters_12.$$arity = 0);
    Opal.defn(self, '$source_location', TMP_UnboundMethod_source_location_13 = function $$source_location() {
      var $a, self = this;

      return ((($a = self.method.$$source_location) !== false && $a !== nil && $a != null) ? $a : ["(eval)", 0])
    }, TMP_UnboundMethod_source_location_13.$$arity = 0);
    Opal.defn(self, '$comments', TMP_UnboundMethod_comments_14 = function $$comments() {
      var $a, self = this;

      return ((($a = self.method.$$comments) !== false && $a !== nil && $a != null) ? $a : [])
    }, TMP_UnboundMethod_comments_14.$$arity = 0);
    Opal.defn(self, '$bind', TMP_UnboundMethod_bind_15 = function $$bind(object) {
      var self = this;

      
      if (self.owner.$$is_module || Opal.is_a(object, self.owner)) {
        return Opal.const_get($scopes, 'Method', true, true).$new(object, self.owner, self.method, self.name);
      }
      else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "can't bind singleton method to a different class (expected " + (object) + ".kind_of?(" + (self.owner) + " to be true)");
      }
    
    }, TMP_UnboundMethod_bind_15.$$arity = 1);
    return (Opal.defn(self, '$inspect', TMP_UnboundMethod_inspect_16 = function $$inspect() {
      var self = this;

      return "" + "#<" + (self.$class()) + ": " + (self.source) + "#" + (self.name) + " (defined in " + (self.owner) + " in " + (self.$source_location().$join(":")) + ")>"
    }, TMP_UnboundMethod_inspect_16.$$arity = 0), nil) && 'inspect';
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/variables"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $gvars = Opal.gvars, $hash2 = Opal.hash2;

  Opal.add_stubs(['$new']);
  
  $gvars['&'] = $gvars['~'] = $gvars['`'] = $gvars["'"] = nil;
  $gvars.LOADED_FEATURES = ($gvars["\""] = Opal.loaded_features);
  $gvars.LOAD_PATH = ($gvars[":"] = []);
  $gvars["/"] = "\n";
  $gvars[","] = nil;
  Opal.cdecl($scope, 'ARGV', []);
  Opal.cdecl($scope, 'ARGF', Opal.const_get($scopes, 'Object', true, true).$new());
  Opal.cdecl($scope, 'ENV', $hash2([], {}));
  $gvars.VERBOSE = false;
  $gvars.DEBUG = false;
  return ($gvars.SAFE = 0);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["opal/regexp_anchors"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$==', '$new']);
  return (function($base, $visibility_scopes) {
    var $Opal, self = $Opal = $module($base, 'Opal');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    
    Opal.cdecl($scope, 'REGEXP_START', (function() {if (Opal.const_get($scopes, 'RUBY_ENGINE', true, true)['$==']("opal")) {
      return "^"
      } else {
      return nil
    }; return nil; })());
    Opal.cdecl($scope, 'REGEXP_END', (function() {if (Opal.const_get($scopes, 'RUBY_ENGINE', true, true)['$==']("opal")) {
      return "$"
      } else {
      return nil
    }; return nil; })());
    Opal.cdecl($scope, 'FORBIDDEN_STARTING_IDENTIFIER_CHARS', "\\u0001-\\u002F\\u003A-\\u0040\\u005B-\\u005E\\u0060\\u007B-\\u007F");
    Opal.cdecl($scope, 'FORBIDDEN_ENDING_IDENTIFIER_CHARS', "\\u0001-\\u0020\\u0022-\\u002F\\u003A-\\u003E\\u0040\\u005B-\\u005E\\u0060\\u007B-\\u007F");
    Opal.cdecl($scope, 'INLINE_IDENTIFIER_REGEXP', Opal.const_get($scopes, 'Regexp', true, true).$new("" + "[^" + (Opal.const_get($scopes, 'FORBIDDEN_STARTING_IDENTIFIER_CHARS', true, true)) + "]*[^" + (Opal.const_get($scopes, 'FORBIDDEN_ENDING_IDENTIFIER_CHARS', true, true)) + "]"));
    Opal.cdecl($scope, 'FORBIDDEN_CONST_NAME_CHARS', "\\u0001-\\u0020\\u0021-\\u002F\\u003B-\\u003F\\u0040\\u005B-\\u005E\\u0060\\u007B-\\u007F");
    Opal.cdecl($scope, 'CONST_NAME_REGEXP', Opal.const_get($scopes, 'Regexp', true, true).$new("" + (Opal.const_get($scopes, 'REGEXP_START', true, true)) + "(::)?[A-Z][^" + (Opal.const_get($scopes, 'FORBIDDEN_CONST_NAME_CHARS', true, true)) + "]*" + (Opal.const_get($scopes, 'REGEXP_END', true, true))));
  })($scope.base, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["opal/mini"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  
  self.$require("opal/base");
  self.$require("corelib/nil");
  self.$require("corelib/boolean");
  self.$require("corelib/string");
  self.$require("corelib/comparable");
  self.$require("corelib/enumerable");
  self.$require("corelib/enumerator");
  self.$require("corelib/array");
  self.$require("corelib/hash");
  self.$require("corelib/number");
  self.$require("corelib/range");
  self.$require("corelib/proc");
  self.$require("corelib/method");
  self.$require("corelib/regexp");
  self.$require("corelib/variables");
  return self.$require("opal/regexp_anchors");
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/string/inheritance"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send, $gvars = Opal.gvars;

  Opal.add_stubs(['$require', '$new', '$allocate', '$initialize', '$to_proc', '$__send__', '$class', '$clone', '$respond_to?', '$==', '$inspect', '$+', '$*', '$map', '$split', '$enum_for', '$each_line', '$to_a', '$%', '$-']);
  
  self.$require("corelib/string");
  (function($base, $super, $visibility_scopes) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_String_inherited_1;

    return Opal.defs(self, '$inherited', TMP_String_inherited_1 = function $$inherited(klass) {
      var self = this, replace = nil;

      
      replace = Opal.const_get($scopes, 'Class', true, true).$new(Opal.const_get([Opal.const_get($scopes, 'String', true, true).$$scope], 'Wrapper', true, true));
      
      klass.$$proto         = replace.$$proto;
      klass.$$proto.$$class = klass;
      klass.$$alloc         = replace.$$alloc;
      klass.$$parent        = Opal.const_get([Opal.const_get($scopes, 'String', true, true).$$scope], 'Wrapper', true, true);

      klass.$allocate = replace.$allocate;
      klass.$new      = replace.$new;
    ;
    }, TMP_String_inherited_1.$$arity = 1)
  })($scope.base, null, $scopes);
  return (function($base, $super, $visibility_scopes) {
    function $Wrapper(){};
    var self = $Wrapper = $klass($base, $super, 'Wrapper', $Wrapper);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Wrapper_allocate_2, TMP_Wrapper_new_3, TMP_Wrapper_$$_4, TMP_Wrapper_initialize_5, TMP_Wrapper_method_missing_6, TMP_Wrapper_initialize_copy_7, TMP_Wrapper_respond_to$q_8, TMP_Wrapper_$eq$eq_9, TMP_Wrapper_to_s_10, TMP_Wrapper_inspect_11, TMP_Wrapper_$_12, TMP_Wrapper_$_13, TMP_Wrapper_split_15, TMP_Wrapper_replace_16, TMP_Wrapper_each_line_17, TMP_Wrapper_lines_19, TMP_Wrapper_$_20, TMP_Wrapper_instance_variables_21;

    def.literal = nil;
    
    def.$$is_string = true;
    Opal.defs(self, '$allocate', TMP_Wrapper_allocate_2 = function $$allocate(string) {
      var self = this, $iter = TMP_Wrapper_allocate_2.$$p, $yield = $iter || nil, obj = nil;

      if (string == null) {
        string = "";
      }
      TMP_Wrapper_allocate_2.$$p = null;
      
      obj = $send(self, Opal.find_super_dispatcher(self, 'allocate', TMP_Wrapper_allocate_2, false, $Wrapper), [], null);
      obj.literal = string;
      return obj;
    }, TMP_Wrapper_allocate_2.$$arity = -1);
    Opal.defs(self, '$new', TMP_Wrapper_new_3 = function($a_rest) {
      var self = this, args, $iter = TMP_Wrapper_new_3.$$p, block = $iter || nil, obj = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Wrapper_new_3.$$p = null;
      
      obj = self.$allocate();
      $send(obj, 'initialize', Opal.to_a(args), block.$to_proc());
      return obj;
    }, TMP_Wrapper_new_3.$$arity = -1);
    Opal.defs(self, '$[]', TMP_Wrapper_$$_4 = function($a_rest) {
      var self = this, objects;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      objects = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        objects[$arg_idx - 0] = arguments[$arg_idx];
      }
      return self.$allocate(objects)
    }, TMP_Wrapper_$$_4.$$arity = -1);
    Opal.defn(self, '$initialize', TMP_Wrapper_initialize_5 = function $$initialize(string) {
      var self = this;

      if (string == null) {
        string = "";
      }
      return (self.literal = string)
    }, TMP_Wrapper_initialize_5.$$arity = -1);
    Opal.defn(self, '$method_missing', TMP_Wrapper_method_missing_6 = function $$method_missing($a_rest) {
      var $b, self = this, args, $iter = TMP_Wrapper_method_missing_6.$$p, block = $iter || nil, result = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      TMP_Wrapper_method_missing_6.$$p = null;
      
      result = $send(self.literal, '__send__', Opal.to_a(args), block.$to_proc());
      if ((($b = result.$$is_string != null) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        if ((($b = result == self.literal) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          return self
          } else {
          return self.$class().$allocate(result)
        }
        } else {
        return result
      };
    }, TMP_Wrapper_method_missing_6.$$arity = -1);
    Opal.defn(self, '$initialize_copy', TMP_Wrapper_initialize_copy_7 = function $$initialize_copy(other) {
      var self = this;

      return (self.literal = (other.literal).$clone())
    }, TMP_Wrapper_initialize_copy_7.$$arity = 1);
    Opal.defn(self, '$respond_to?', TMP_Wrapper_respond_to$q_8 = function(name, $a_rest) {
      var $b, self = this, $iter = TMP_Wrapper_respond_to$q_8.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Wrapper_respond_to$q_8.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      return ((($b = $send(self, Opal.find_super_dispatcher(self, 'respond_to?', TMP_Wrapper_respond_to$q_8, false), $zuper, $iter)) !== false && $b !== nil && $b != null) ? $b : self.literal['$respond_to?'](name))
    }, TMP_Wrapper_respond_to$q_8.$$arity = -2);
    Opal.defn(self, '$==', TMP_Wrapper_$eq$eq_9 = function(other) {
      var self = this;

      return self.literal['$=='](other)
    }, TMP_Wrapper_$eq$eq_9.$$arity = 1);
    Opal.alias(self, "eql?", "==");
    Opal.alias(self, "===", "==");
    Opal.defn(self, '$to_s', TMP_Wrapper_to_s_10 = function $$to_s() {
      var self = this;

      return self.literal
    }, TMP_Wrapper_to_s_10.$$arity = 0);
    Opal.alias(self, "to_str", "to_s");
    Opal.defn(self, '$inspect', TMP_Wrapper_inspect_11 = function $$inspect() {
      var self = this;

      return self.literal.$inspect()
    }, TMP_Wrapper_inspect_11.$$arity = 0);
    Opal.defn(self, '$+', TMP_Wrapper_$_12 = function(other) {
      var self = this;

      return $rb_plus(self.literal, other)
    }, TMP_Wrapper_$_12.$$arity = 1);
    Opal.defn(self, '$*', TMP_Wrapper_$_13 = function(other) {
      var self = this;

      
      var result = $rb_times(self.literal, other);

      if (result.$$is_string) {
        return self.$class().$allocate(result)
      }
      else {
        return result;
      }
    
    }, TMP_Wrapper_$_13.$$arity = 1);
    Opal.defn(self, '$split', TMP_Wrapper_split_15 = function $$split(pattern, limit) {
      var TMP_14, self = this;

      return $send(self.literal.$split(pattern, limit), 'map', [], (TMP_14 = function(str){var self = TMP_14.$$s || this;
if (str == null) str = nil;
      return self.$class().$allocate(str)}, TMP_14.$$s = self, TMP_14.$$arity = 1, TMP_14))
    }, TMP_Wrapper_split_15.$$arity = -1);
    Opal.defn(self, '$replace', TMP_Wrapper_replace_16 = function $$replace(string) {
      var self = this;

      return (self.literal = string)
    }, TMP_Wrapper_replace_16.$$arity = 1);
    Opal.defn(self, '$each_line', TMP_Wrapper_each_line_17 = function $$each_line(separator) {
      var TMP_18, self = this, $iter = TMP_Wrapper_each_line_17.$$p, $yield = $iter || nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      TMP_Wrapper_each_line_17.$$p = null;
      
      if (($yield !== nil)) {
        } else {
        return self.$enum_for("each_line", separator)
      };
      return $send(self.literal, 'each_line', [separator], (TMP_18 = function(str){var self = TMP_18.$$s || this;
if (str == null) str = nil;
      return Opal.yield1($yield, self.$class().$allocate(str));}, TMP_18.$$s = self, TMP_18.$$arity = 1, TMP_18));
    }, TMP_Wrapper_each_line_17.$$arity = -1);
    Opal.defn(self, '$lines', TMP_Wrapper_lines_19 = function $$lines(separator) {
      var self = this, $iter = TMP_Wrapper_lines_19.$$p, block = $iter || nil, e = nil;
      if ($gvars["/"] == null) $gvars["/"] = nil;

      if (separator == null) {
        separator = $gvars["/"];
      }
      TMP_Wrapper_lines_19.$$p = null;
      
      e = $send(self, 'each_line', [separator], block.$to_proc());
      if (block !== false && block !== nil && block != null) {
        return self
        } else {
        return e.$to_a()
      };
    }, TMP_Wrapper_lines_19.$$arity = -1);
    Opal.defn(self, '$%', TMP_Wrapper_$_20 = function(data) {
      var self = this;

      return self.literal['$%'](data)
    }, TMP_Wrapper_$_20.$$arity = 1);
    return (Opal.defn(self, '$instance_variables', TMP_Wrapper_instance_variables_21 = function $$instance_variables() {
      var self = this, $iter = TMP_Wrapper_instance_variables_21.$$p, $yield = $iter || nil, $zuper = nil, $zuper_i = nil, $zuper_ii = nil;

      TMP_Wrapper_instance_variables_21.$$p = null;
      // Prepare super implicit arguments
      for($zuper_i = 0, $zuper_ii = arguments.length, $zuper = new Array($zuper_ii); $zuper_i < $zuper_ii; $zuper_i++) {
        $zuper[$zuper_i] = arguments[$zuper_i];
      }
      return $rb_minus($send(self, Opal.find_super_dispatcher(self, 'instance_variables', TMP_Wrapper_instance_variables_21, false), $zuper, $iter), ["@literal"])
    }, TMP_Wrapper_instance_variables_21.$$arity = 0), nil) && 'instance_variables';
  })(Opal.const_get($scopes, 'String', true, true), null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/string/encoding"] = function(Opal) {
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var TMP_13, TMP_16, TMP_19, TMP_22, TMP_25, self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$+', '$[]', '$new', '$to_proc', '$each', '$const_set', '$sub', '$upcase', '$constants', '$const_get', '$===', '$==', '$name', '$include?', '$names', '$raise', '$attr_accessor', '$attr_reader', '$register', '$length', '$bytes', '$to_a', '$each_byte', '$bytesize', '$enum_for', '$force_encoding', '$dup', '$coerce_to!', '$find', '$nil?', '$getbyte']);
  
  self.$require("corelib/string");
  (function($base, $super, $visibility_scopes) {
    function $Encoding(){};
    var self = $Encoding = $klass($base, $super, 'Encoding', $Encoding);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Encoding_register_1, TMP_Encoding_find_4, TMP_Encoding_initialize_5, TMP_Encoding_ascii_compatible$q_6, TMP_Encoding_dummy$q_7, TMP_Encoding_to_s_8, TMP_Encoding_inspect_9, TMP_Encoding_each_byte_10, TMP_Encoding_getbyte_11, TMP_Encoding_bytesize_12;

    def.ascii = def.dummy = def.name = nil;
    
    Opal.defs(self, '$register', TMP_Encoding_register_1 = function $$register(name, options) {
      var $a, TMP_2, self = this, $iter = TMP_Encoding_register_1.$$p, block = $iter || nil, names = nil, encoding = nil;

      if (options == null) {
        options = $hash2([], {});
      }
      TMP_Encoding_register_1.$$p = null;
      
      names = $rb_plus([name], ((($a = options['$[]']("aliases")) !== false && $a !== nil && $a != null) ? $a : []));
      encoding = $send(Opal.const_get($scopes, 'Class', true, true), 'new', [self], block.$to_proc()).$new(name, names, ((($a = options['$[]']("ascii")) !== false && $a !== nil && $a != null) ? $a : false), ((($a = options['$[]']("dummy")) !== false && $a !== nil && $a != null) ? $a : false));
      return $send(names, 'each', [], (TMP_2 = function(name){var self = TMP_2.$$s || this;
if (name == null) name = nil;
      return self.$const_set(name.$sub("-", "_"), encoding)}, TMP_2.$$s = self, TMP_2.$$arity = 1, TMP_2));
    }, TMP_Encoding_register_1.$$arity = -2);
    Opal.defs(self, '$find', TMP_Encoding_find_4 = function $$find(name) {try {

      var TMP_3, self = this, upcase = nil;

      
      upcase = name.$upcase();
      $send(self.$constants(), 'each', [], (TMP_3 = function(const$){var self = TMP_3.$$s || this, $a, $b, encoding = nil;
if (const$ == null) const$ = nil;
      
        encoding = self.$const_get(const$);
        if ((($a = Opal.const_get($scopes, 'Encoding', true, true)['$==='](encoding)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          return nil;
        };
        if ((($a = ((($b = encoding.$name()['$=='](upcase)) !== false && $b !== nil && $b != null) ? $b : encoding.$names()['$include?'](upcase))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          Opal.ret(encoding)
          } else {
          return nil
        };}, TMP_3.$$s = self, TMP_3.$$arity = 1, TMP_3));
      return self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "unknown encoding name - " + (name));
      } catch ($returner) { if ($returner === Opal.returner) { return $returner.$v } throw $returner; }
    }, TMP_Encoding_find_4.$$arity = 1);
    (function(self, $visibility_scopes) {
      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat(self);

      return self.$attr_accessor("default_external")
    })(Opal.get_singleton_class(self), $scopes);
    self.$attr_reader("name", "names");
    Opal.defn(self, '$initialize', TMP_Encoding_initialize_5 = function $$initialize(name, names, ascii, dummy) {
      var self = this;

      
      self.name = name;
      self.names = names;
      self.ascii = ascii;
      return (self.dummy = dummy);
    }, TMP_Encoding_initialize_5.$$arity = 4);
    Opal.defn(self, '$ascii_compatible?', TMP_Encoding_ascii_compatible$q_6 = function() {
      var self = this;

      return self.ascii
    }, TMP_Encoding_ascii_compatible$q_6.$$arity = 0);
    Opal.defn(self, '$dummy?', TMP_Encoding_dummy$q_7 = function() {
      var self = this;

      return self.dummy
    }, TMP_Encoding_dummy$q_7.$$arity = 0);
    Opal.defn(self, '$to_s', TMP_Encoding_to_s_8 = function $$to_s() {
      var self = this;

      return self.name
    }, TMP_Encoding_to_s_8.$$arity = 0);
    Opal.defn(self, '$inspect', TMP_Encoding_inspect_9 = function $$inspect() {
      var $a, self = this;

      return "" + "#<Encoding:" + (self.name) + ((function() {if ((($a = self.dummy) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return " (dummy)"
        } else {
        return nil
      }; return nil; })()) + ">"
    }, TMP_Encoding_inspect_9.$$arity = 0);
    Opal.defn(self, '$each_byte', TMP_Encoding_each_byte_10 = function $$each_byte($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true))
    }, TMP_Encoding_each_byte_10.$$arity = -1);
    Opal.defn(self, '$getbyte', TMP_Encoding_getbyte_11 = function $$getbyte($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true))
    }, TMP_Encoding_getbyte_11.$$arity = -1);
    Opal.defn(self, '$bytesize', TMP_Encoding_bytesize_12 = function $$bytesize($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true))
    }, TMP_Encoding_bytesize_12.$$arity = -1);
    (function($base, $super, $visibility_scopes) {
      function $EncodingError(){};
      var self = $EncodingError = $klass($base, $super, 'EncodingError', $EncodingError);

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

      return nil
    })($scope.base, Opal.const_get($scopes, 'StandardError', true, true), $scopes);
    return (function($base, $super, $visibility_scopes) {
      function $CompatibilityError(){};
      var self = $CompatibilityError = $klass($base, $super, 'CompatibilityError', $CompatibilityError);

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

      return nil
    })($scope.base, Opal.const_get($scopes, 'EncodingError', true, true), $scopes);
  })($scope.base, null, $scopes);
  $send(Opal.const_get($scopes, 'Encoding', true, true), 'register', ["UTF-8", $hash2(["aliases", "ascii"], {"aliases": ["CP65001"], "ascii": true})], (TMP_13 = function(){var self = TMP_13.$$s || this, TMP_each_byte_14, TMP_bytesize_15;

  
    Opal.def(self, '$each_byte', TMP_each_byte_14 = function $$each_byte(string) {
      var self = this, $iter = TMP_each_byte_14.$$p, block = $iter || nil;

      TMP_each_byte_14.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        if (code <= 0x7f) {
          Opal.yield1(block, code);
        }
        else {
          var encoded = encodeURIComponent(string.charAt(i)).substr(1).split('%');

          for (var j = 0, encoded_length = encoded.length; j < encoded_length; j++) {
            Opal.yield1(block, parseInt(encoded[j], 16));
          }
        }
      }
    
    }, TMP_each_byte_14.$$arity = 1);
    return (Opal.def(self, '$bytesize', TMP_bytesize_15 = function $$bytesize(string) {
      var self = this;

      return string.$bytes().$length()
    }, TMP_bytesize_15.$$arity = 1), nil) && 'bytesize';}, TMP_13.$$s = self, TMP_13.$$arity = 0, TMP_13));
  $send(Opal.const_get($scopes, 'Encoding', true, true), 'register', ["UTF-16LE"], (TMP_16 = function(){var self = TMP_16.$$s || this, TMP_each_byte_17, TMP_bytesize_18;

  
    Opal.def(self, '$each_byte', TMP_each_byte_17 = function $$each_byte(string) {
      var self = this, $iter = TMP_each_byte_17.$$p, block = $iter || nil;

      TMP_each_byte_17.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        Opal.yield1(block, code & 0xff);
        Opal.yield1(block, code >> 8);
      }
    
    }, TMP_each_byte_17.$$arity = 1);
    return (Opal.def(self, '$bytesize', TMP_bytesize_18 = function $$bytesize(string) {
      var self = this;

      return string.$bytes().$length()
    }, TMP_bytesize_18.$$arity = 1), nil) && 'bytesize';}, TMP_16.$$s = self, TMP_16.$$arity = 0, TMP_16));
  $send(Opal.const_get($scopes, 'Encoding', true, true), 'register', ["UTF-16BE"], (TMP_19 = function(){var self = TMP_19.$$s || this, TMP_each_byte_20, TMP_bytesize_21;

  
    Opal.def(self, '$each_byte', TMP_each_byte_20 = function $$each_byte(string) {
      var self = this, $iter = TMP_each_byte_20.$$p, block = $iter || nil;

      TMP_each_byte_20.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        Opal.yield1(block, code >> 8);
        Opal.yield1(block, code & 0xff);
      }
    
    }, TMP_each_byte_20.$$arity = 1);
    return (Opal.def(self, '$bytesize', TMP_bytesize_21 = function $$bytesize(string) {
      var self = this;

      return string.$bytes().$length()
    }, TMP_bytesize_21.$$arity = 1), nil) && 'bytesize';}, TMP_19.$$s = self, TMP_19.$$arity = 0, TMP_19));
  $send(Opal.const_get($scopes, 'Encoding', true, true), 'register', ["UTF-32LE"], (TMP_22 = function(){var self = TMP_22.$$s || this, TMP_each_byte_23, TMP_bytesize_24;

  
    Opal.def(self, '$each_byte', TMP_each_byte_23 = function $$each_byte(string) {
      var self = this, $iter = TMP_each_byte_23.$$p, block = $iter || nil;

      TMP_each_byte_23.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        Opal.yield1(block, code & 0xff);
        Opal.yield1(block, code >> 8);
      }
    
    }, TMP_each_byte_23.$$arity = 1);
    return (Opal.def(self, '$bytesize', TMP_bytesize_24 = function $$bytesize(string) {
      var self = this;

      return string.$bytes().$length()
    }, TMP_bytesize_24.$$arity = 1), nil) && 'bytesize';}, TMP_22.$$s = self, TMP_22.$$arity = 0, TMP_22));
  $send(Opal.const_get($scopes, 'Encoding', true, true), 'register', ["ASCII-8BIT", $hash2(["aliases", "ascii"], {"aliases": ["BINARY"], "ascii": true})], (TMP_25 = function(){var self = TMP_25.$$s || this, TMP_each_byte_26, TMP_bytesize_27;

  
    Opal.def(self, '$each_byte', TMP_each_byte_26 = function $$each_byte(string) {
      var self = this, $iter = TMP_each_byte_26.$$p, block = $iter || nil;

      TMP_each_byte_26.$$p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        Opal.yield1(block, string.charCodeAt(i) & 0xff);
      }
    
    }, TMP_each_byte_26.$$arity = 1);
    return (Opal.def(self, '$bytesize', TMP_bytesize_27 = function $$bytesize(string) {
      var self = this;

      return string.$bytes().$length()
    }, TMP_bytesize_27.$$arity = 1), nil) && 'bytesize';}, TMP_25.$$s = self, TMP_25.$$arity = 0, TMP_25));
  return (function($base, $super, $visibility_scopes) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_String_bytes_28, TMP_String_bytesize_29, TMP_String_each_byte_30, TMP_String_encode_31, TMP_String_encoding_32, TMP_String_force_encoding_33, TMP_String_getbyte_34, TMP_String_valid_encoding$q_35;

    def.encoding = nil;
    
    String.prototype.encoding = Opal.const_get([Opal.const_get($scopes, 'Encoding', true, true).$$scope], 'UTF_16LE', true, true);
    Opal.defn(self, '$bytes', TMP_String_bytes_28 = function $$bytes() {
      var self = this;

      return self.$each_byte().$to_a()
    }, TMP_String_bytes_28.$$arity = 0);
    Opal.defn(self, '$bytesize', TMP_String_bytesize_29 = function $$bytesize() {
      var self = this;

      return self.encoding.$bytesize(self)
    }, TMP_String_bytesize_29.$$arity = 0);
    Opal.defn(self, '$each_byte', TMP_String_each_byte_30 = function $$each_byte() {
      var self = this, $iter = TMP_String_each_byte_30.$$p, block = $iter || nil;

      TMP_String_each_byte_30.$$p = null;
      
      if ((block !== nil)) {
        } else {
        return self.$enum_for("each_byte")
      };
      $send(self.encoding, 'each_byte', [self], block.$to_proc());
      return self;
    }, TMP_String_each_byte_30.$$arity = 0);
    Opal.defn(self, '$encode', TMP_String_encode_31 = function $$encode(encoding) {
      var self = this;

      return self.$dup().$force_encoding(encoding)
    }, TMP_String_encode_31.$$arity = 1);
    Opal.defn(self, '$encoding', TMP_String_encoding_32 = function $$encoding() {
      var self = this;

      return self.encoding
    }, TMP_String_encoding_32.$$arity = 0);
    Opal.defn(self, '$force_encoding', TMP_String_force_encoding_33 = function $$force_encoding(encoding) {
      var $a, self = this;

      
      encoding = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](encoding, Opal.const_get($scopes, 'String', true, true), "to_s");
      encoding = Opal.const_get($scopes, 'Encoding', true, true).$find(encoding);
      if (encoding['$=='](self.encoding)) {
        return self};
      if ((($a = encoding['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "unknown encoding name - " + (encoding))};
      
      var result = new String(self);
      result.encoding = encoding;

      return result;
    ;
    }, TMP_String_force_encoding_33.$$arity = 1);
    Opal.defn(self, '$getbyte', TMP_String_getbyte_34 = function $$getbyte(idx) {
      var self = this;

      return self.encoding.$getbyte(self, idx)
    }, TMP_String_getbyte_34.$$arity = 1);
    return (Opal.defn(self, '$valid_encoding?', TMP_String_valid_encoding$q_35 = function() {
      var self = this;

      return true
    }, TMP_String_valid_encoding$q_35.$$arity = 0), nil) && 'valid_encoding?';
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/math"] = function(Opal) {
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $module = Opal.module;

  Opal.add_stubs(['$new', '$raise', '$Float', '$type_error', '$Integer', '$module_function', '$checked', '$float!', '$===', '$gamma', '$-', '$integer!', '$/', '$infinite?']);
  return (function($base, $visibility_scopes) {
    var $Math, self = $Math = $module($base, 'Math');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Math_checked_1, TMP_Math_float$B_2, TMP_Math_integer$B_3, TMP_Math_acos_4, $a, TMP_Math_acosh_5, TMP_Math_asin_6, TMP_Math_asinh_7, TMP_Math_atan_8, TMP_Math_atan2_9, TMP_Math_atanh_10, TMP_Math_cbrt_11, TMP_Math_cos_12, TMP_Math_cosh_13, TMP_Math_erf_14, TMP_Math_erfc_15, TMP_Math_exp_16, TMP_Math_frexp_17, TMP_Math_gamma_18, TMP_Math_hypot_19, TMP_Math_ldexp_20, TMP_Math_lgamma_21, TMP_Math_log_22, TMP_Math_log10_23, TMP_Math_log2_24, TMP_Math_sin_25, TMP_Math_sinh_26, TMP_Math_sqrt_27, TMP_Math_tan_28, TMP_Math_tanh_29;

    
    Opal.cdecl($scope, 'E', Math.E);
    Opal.cdecl($scope, 'PI', Math.PI);
    Opal.cdecl($scope, 'DomainError', Opal.const_get($scopes, 'Class', true, true).$new(Opal.const_get($scopes, 'StandardError', true, true)));
    Opal.defs(self, '$checked', TMP_Math_checked_1 = function $$checked(method, $a_rest) {
      var self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      if (isNaN(args[0]) || (args.length == 2 && isNaN(args[1]))) {
        return NaN;
      }

      var result = Math[method].apply(null, args);

      if (isNaN(result)) {
        self.$raise(Opal.const_get($scopes, 'DomainError', true, true), "" + "Numerical argument is out of domain - \"" + (method) + "\"");
      }

      return result;
    
    }, TMP_Math_checked_1.$$arity = -2);
    Opal.defs(self, '$float!', TMP_Math_float$B_2 = function(value) {
      var self = this;

      
      try {
        return self.$Float(value)
      } catch ($err) {
        if (Opal.rescue($err, [Opal.const_get($scopes, 'ArgumentError', true, true)])) {
          try {
            return self.$raise(Opal.const_get($scopes, 'Opal', true, true).$type_error(value, Opal.const_get($scopes, 'Float', true, true)))
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_Math_float$B_2.$$arity = 1);
    Opal.defs(self, '$integer!', TMP_Math_integer$B_3 = function(value) {
      var self = this;

      
      try {
        return self.$Integer(value)
      } catch ($err) {
        if (Opal.rescue($err, [Opal.const_get($scopes, 'ArgumentError', true, true)])) {
          try {
            return self.$raise(Opal.const_get($scopes, 'Opal', true, true).$type_error(value, Opal.const_get($scopes, 'Integer', true, true)))
          } finally { Opal.pop_exception() }
        } else { throw $err; }
      };
    }, TMP_Math_integer$B_3.$$arity = 1);
    self.$module_function();
    Opal.defn(self, '$acos', TMP_Math_acos_4 = function $$acos(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("acos", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_acos_4.$$arity = 1);
    if ((($a = (typeof(Math.acosh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.acosh = function(x) {
        return Math.log(x + Math.sqrt(x * x - 1));
      }
    
    };
    Opal.defn(self, '$acosh', TMP_Math_acosh_5 = function $$acosh(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("acosh", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_acosh_5.$$arity = 1);
    Opal.defn(self, '$asin', TMP_Math_asin_6 = function $$asin(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("asin", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_asin_6.$$arity = 1);
    if ((($a = (typeof(Math.asinh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.asinh = function(x) {
        return Math.log(x + Math.sqrt(x * x + 1))
      }
    
    };
    Opal.defn(self, '$asinh', TMP_Math_asinh_7 = function $$asinh(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("asinh", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_asinh_7.$$arity = 1);
    Opal.defn(self, '$atan', TMP_Math_atan_8 = function $$atan(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("atan", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_atan_8.$$arity = 1);
    Opal.defn(self, '$atan2', TMP_Math_atan2_9 = function $$atan2(y, x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("atan2", Opal.const_get($scopes, 'Math', true, true)['$float!'](y), Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_atan2_9.$$arity = 2);
    if ((($a = (typeof(Math.atanh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.atanh = function(x) {
        return 0.5 * Math.log((1 + x) / (1 - x));
      }
    
    };
    Opal.defn(self, '$atanh', TMP_Math_atanh_10 = function $$atanh(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("atanh", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_atanh_10.$$arity = 1);
    if ((($a = (typeof(Math.cbrt) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.cbrt = function(x) {
        if (x == 0) {
          return 0;
        }

        if (x < 0) {
          return -Math.cbrt(-x);
        }

        var r  = x,
            ex = 0;

        while (r < 0.125) {
          r *= 8;
          ex--;
        }

        while (r > 1.0) {
          r *= 0.125;
          ex++;
        }

        r = (-0.46946116 * r + 1.072302) * r + 0.3812513;

        while (ex < 0) {
          r *= 0.5;
          ex++;
        }

        while (ex > 0) {
          r *= 2;
          ex--;
        }

        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);
        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);
        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);
        r = (2.0 / 3.0) * r + (1.0 / 3.0) * x / (r * r);

        return r;
      }
    
    };
    Opal.defn(self, '$cbrt', TMP_Math_cbrt_11 = function $$cbrt(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("cbrt", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_cbrt_11.$$arity = 1);
    Opal.defn(self, '$cos', TMP_Math_cos_12 = function $$cos(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("cos", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_cos_12.$$arity = 1);
    if ((($a = (typeof(Math.cosh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.cosh = function(x) {
        return (Math.exp(x) + Math.exp(-x)) / 2;
      }
    
    };
    Opal.defn(self, '$cosh', TMP_Math_cosh_13 = function $$cosh(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("cosh", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_cosh_13.$$arity = 1);
    if ((($a = (typeof(Math.erf) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.erf = function(x) {
        var A1 =  0.254829592,
            A2 = -0.284496736,
            A3 =  1.421413741,
            A4 = -1.453152027,
            A5 =  1.061405429,
            P  =  0.3275911;

        var sign = 1;

        if (x < 0) {
            sign = -1;
        }

        x = Math.abs(x);

        var t = 1.0 / (1.0 + P * x);
        var y = 1.0 - (((((A5 * t + A4) * t) + A3) * t + A2) * t + A1) * t * Math.exp(-x * x);

        return sign * y;
      }
    
    };
    Opal.defn(self, '$erf', TMP_Math_erf_14 = function $$erf(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("erf", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_erf_14.$$arity = 1);
    if ((($a = (typeof(Math.erfc) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.erfc = function(x) {
        var z = Math.abs(x),
            t = 1.0 / (0.5 * z + 1.0);

        var A1 = t * 0.17087277 + -0.82215223,
            A2 = t * A1 + 1.48851587,
            A3 = t * A2 + -1.13520398,
            A4 = t * A3 + 0.27886807,
            A5 = t * A4 + -0.18628806,
            A6 = t * A5 + 0.09678418,
            A7 = t * A6 + 0.37409196,
            A8 = t * A7 + 1.00002368,
            A9 = t * A8,
            A10 = -z * z - 1.26551223 + A9;

        var a = t * Math.exp(A10);

        if (x < 0.0) {
          return 2.0 - a;
        }
        else {
          return a;
        }
      }
    
    };
    Opal.defn(self, '$erfc', TMP_Math_erfc_15 = function $$erfc(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("erfc", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_erfc_15.$$arity = 1);
    Opal.defn(self, '$exp', TMP_Math_exp_16 = function $$exp(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("exp", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_exp_16.$$arity = 1);
    Opal.defn(self, '$frexp', TMP_Math_frexp_17 = function $$frexp(x) {
      var self = this;

      
      x = Opal.const_get($scopes, 'Math', true, true)['$float!'](x);
      
      if (isNaN(x)) {
        return [NaN, 0];
      }

      var ex   = Math.floor(Math.log(Math.abs(x)) / Math.log(2)) + 1,
          frac = x / Math.pow(2, ex);

      return [frac, ex];
    ;
    }, TMP_Math_frexp_17.$$arity = 1);
    Opal.defn(self, '$gamma', TMP_Math_gamma_18 = function $$gamma(n) {
      var self = this;

      
      n = Opal.const_get($scopes, 'Math', true, true)['$float!'](n);
      
      var i, t, x, value, result, twoN, threeN, fourN, fiveN;

      var G = 4.7421875;

      var P = [
         0.99999999999999709182,
         57.156235665862923517,
        -59.597960355475491248,
         14.136097974741747174,
        -0.49191381609762019978,
         0.33994649984811888699e-4,
         0.46523628927048575665e-4,
        -0.98374475304879564677e-4,
         0.15808870322491248884e-3,
        -0.21026444172410488319e-3,
         0.21743961811521264320e-3,
        -0.16431810653676389022e-3,
         0.84418223983852743293e-4,
        -0.26190838401581408670e-4,
         0.36899182659531622704e-5
      ];


      if (isNaN(n)) {
        return NaN;
      }

      if (n === 0 && 1 / n < 0) {
        return -Infinity;
      }

      if (n === -1 || n === -Infinity) {
        self.$raise(Opal.const_get($scopes, 'DomainError', true, true), "Numerical argument is out of domain - \"gamma\"");
      }

      if (Opal.const_get($scopes, 'Integer', true, true)['$==='](n)) {
        if (n <= 0) {
          return isFinite(n) ? Infinity : NaN;
        }

        if (n > 171) {
          return Infinity;
        }

        value  = n - 2;
        result = n - 1;

        while (value > 1) {
          result *= value;
          value--;
        }

        if (result == 0) {
          result = 1;
        }

        return result;
      }

      if (n < 0.5) {
        return Math.PI / (Math.sin(Math.PI * n) * Opal.const_get($scopes, 'Math', true, true).$gamma($rb_minus(1, n)));
      }

      if (n >= 171.35) {
        return Infinity;
      }

      if (n > 85.0) {
        twoN   = n * n;
        threeN = twoN * n;
        fourN  = threeN * n;
        fiveN  = fourN * n;

        return Math.sqrt(2 * Math.PI / n) * Math.pow((n / Math.E), n) *
          (1 + 1 / (12 * n) + 1 / (288 * twoN) - 139 / (51840 * threeN) -
          571 / (2488320 * fourN) + 163879 / (209018880 * fiveN) +
          5246819 / (75246796800 * fiveN * n));
      }

      n -= 1;
      x  = P[0];

      for (i = 1; i < P.length; ++i) {
        x += P[i] / (n + i);
      }

      t = n + G + 0.5;

      return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
    ;
    }, TMP_Math_gamma_18.$$arity = 1);
    if ((($a = (typeof(Math.hypot) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.hypot = function(x, y) {
        return Math.sqrt(x * x + y * y)
      }
    
    };
    Opal.defn(self, '$hypot', TMP_Math_hypot_19 = function $$hypot(x, y) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("hypot", Opal.const_get($scopes, 'Math', true, true)['$float!'](x), Opal.const_get($scopes, 'Math', true, true)['$float!'](y))
    }, TMP_Math_hypot_19.$$arity = 2);
    Opal.defn(self, '$ldexp', TMP_Math_ldexp_20 = function $$ldexp(mantissa, exponent) {
      var self = this;

      
      mantissa = Opal.const_get($scopes, 'Math', true, true)['$float!'](mantissa);
      exponent = Opal.const_get($scopes, 'Math', true, true)['$integer!'](exponent);
      
      if (isNaN(exponent)) {
        self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "float NaN out of range of integer");
      }

      return mantissa * Math.pow(2, exponent);
    ;
    }, TMP_Math_ldexp_20.$$arity = 2);
    Opal.defn(self, '$lgamma', TMP_Math_lgamma_21 = function $$lgamma(n) {
      var self = this;

      
      if (n == -1) {
        return [Infinity, 1];
      }
      else {
        return [Math.log(Math.abs(Opal.const_get($scopes, 'Math', true, true).$gamma(n))), Opal.const_get($scopes, 'Math', true, true).$gamma(n) < 0 ? -1 : 1];
      }
    
    }, TMP_Math_lgamma_21.$$arity = 1);
    Opal.defn(self, '$log', TMP_Math_log_22 = function $$log(x, base) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'String', true, true)['$==='](x)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'Opal', true, true).$type_error(x, Opal.const_get($scopes, 'Float', true, true)))};
      if ((($a = base == null) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Opal.const_get($scopes, 'Math', true, true).$checked("log", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
        } else {
        
        if ((($a = Opal.const_get($scopes, 'String', true, true)['$==='](base)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'Opal', true, true).$type_error(base, Opal.const_get($scopes, 'Float', true, true)))};
        return $rb_divide(Opal.const_get($scopes, 'Math', true, true).$checked("log", Opal.const_get($scopes, 'Math', true, true)['$float!'](x)), Opal.const_get($scopes, 'Math', true, true).$checked("log", Opal.const_get($scopes, 'Math', true, true)['$float!'](base)));
      };
    }, TMP_Math_log_22.$$arity = -2);
    if ((($a = (typeof(Math.log10) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.log10 = function(x) {
        return Math.log(x) / Math.LN10;
      }
    
    };
    Opal.defn(self, '$log10', TMP_Math_log10_23 = function $$log10(x) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'String', true, true)['$==='](x)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'Opal', true, true).$type_error(x, Opal.const_get($scopes, 'Float', true, true)))};
      return Opal.const_get($scopes, 'Math', true, true).$checked("log10", Opal.const_get($scopes, 'Math', true, true)['$float!'](x));
    }, TMP_Math_log10_23.$$arity = 1);
    if ((($a = (typeof(Math.log2) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.log2 = function(x) {
        return Math.log(x) / Math.LN2;
      }
    
    };
    Opal.defn(self, '$log2', TMP_Math_log2_24 = function $$log2(x) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'String', true, true)['$==='](x)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'Opal', true, true).$type_error(x, Opal.const_get($scopes, 'Float', true, true)))};
      return Opal.const_get($scopes, 'Math', true, true).$checked("log2", Opal.const_get($scopes, 'Math', true, true)['$float!'](x));
    }, TMP_Math_log2_24.$$arity = 1);
    Opal.defn(self, '$sin', TMP_Math_sin_25 = function $$sin(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("sin", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_sin_25.$$arity = 1);
    if ((($a = (typeof(Math.sinh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.sinh = function(x) {
        return (Math.exp(x) - Math.exp(-x)) / 2;
      }
    
    };
    Opal.defn(self, '$sinh', TMP_Math_sinh_26 = function $$sinh(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("sinh", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_sinh_26.$$arity = 1);
    Opal.defn(self, '$sqrt', TMP_Math_sqrt_27 = function $$sqrt(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("sqrt", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_sqrt_27.$$arity = 1);
    Opal.defn(self, '$tan', TMP_Math_tan_28 = function $$tan(x) {
      var $a, self = this;

      
      x = Opal.const_get($scopes, 'Math', true, true)['$float!'](x);
      if ((($a = x['$infinite?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'NAN', true, true)};
      return Opal.const_get($scopes, 'Math', true, true).$checked("tan", Opal.const_get($scopes, 'Math', true, true)['$float!'](x));
    }, TMP_Math_tan_28.$$arity = 1);
    if ((($a = (typeof(Math.tanh) !== "undefined")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
      } else {
      
      Math.tanh = function(x) {
        if (x == Infinity) {
          return 1;
        }
        else if (x == -Infinity) {
          return -1;
        }
        else {
          return (Math.exp(x) - Math.exp(-x)) / (Math.exp(x) + Math.exp(-x));
        }
      }
    
    };
    Opal.defn(self, '$tanh', TMP_Math_tanh_29 = function $$tanh(x) {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$checked("tanh", Opal.const_get($scopes, 'Math', true, true)['$float!'](x))
    }, TMP_Math_tanh_29.$$arity = 1);
  })($scope.base, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/complex"] = function(Opal) {
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$require', '$===', '$real?', '$raise', '$new', '$*', '$cos', '$sin', '$attr_reader', '$class', '$==', '$real', '$imag', '$Complex', '$-@', '$+', '$__coerced__', '$-', '$nan?', '$/', '$conj', '$abs2', '$quo', '$polar', '$exp', '$log', '$>', '$!=', '$divmod', '$**', '$hypot', '$atan2', '$lcm', '$denominator', '$to_s', '$numerator', '$abs', '$arg', '$rationalize', '$to_f', '$to_i', '$to_r', '$inspect', '$positive?', '$zero?', '$infinite?']);
  
  self.$require("corelib/numeric");
  (function($base, $super, $visibility_scopes) {
    function $Complex(){};
    var self = $Complex = $klass($base, $super, 'Complex', $Complex);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Complex_rect_1, TMP_Complex_polar_2, TMP_Complex_initialize_3, TMP_Complex_coerce_4, TMP_Complex_$eq$eq_5, TMP_Complex_$$_6, TMP_Complex_$_7, TMP_Complex_$_8, TMP_Complex_$_9, TMP_Complex_$_10, TMP_Complex_$$_11, TMP_Complex_abs_12, TMP_Complex_abs2_13, TMP_Complex_angle_14, TMP_Complex_conj_15, TMP_Complex_denominator_16, TMP_Complex_eql$q_17, TMP_Complex_fdiv_18, TMP_Complex_hash_19, TMP_Complex_inspect_20, TMP_Complex_numerator_21, TMP_Complex_polar_22, TMP_Complex_rationalize_23, TMP_Complex_real$q_24, TMP_Complex_rect_25, TMP_Complex_to_f_26, TMP_Complex_to_i_27, TMP_Complex_to_r_28, TMP_Complex_to_s_29;

    def.real = def.imag = nil;
    
    Opal.defs(self, '$rect', TMP_Complex_rect_1 = function $$rect(real, imag) {
      var $a, $b, $c, $d, self = this;

      if (imag == null) {
        imag = 0;
      }
      
      if ((($a = ($b = ($c = ($d = Opal.const_get($scopes, 'Numeric', true, true)['$==='](real), $d !== false && $d !== nil && $d != null ?real['$real?']() : $d), $c !== false && $c !== nil && $c != null ?Opal.const_get($scopes, 'Numeric', true, true)['$==='](imag) : $c), $b !== false && $b !== nil && $b != null ?imag['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "not a real")
      };
      return self.$new(real, imag);
    }, TMP_Complex_rect_1.$$arity = -2);
    (function(self, $visibility_scopes) {
      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat(self);

      return Opal.alias(self, "rectangular", "rect")
    })(Opal.get_singleton_class(self), $scopes);
    Opal.defs(self, '$polar', TMP_Complex_polar_2 = function $$polar(r, theta) {
      var $a, $b, $c, $d, self = this;

      if (theta == null) {
        theta = 0;
      }
      
      if ((($a = ($b = ($c = ($d = Opal.const_get($scopes, 'Numeric', true, true)['$==='](r), $d !== false && $d !== nil && $d != null ?r['$real?']() : $d), $c !== false && $c !== nil && $c != null ?Opal.const_get($scopes, 'Numeric', true, true)['$==='](theta) : $c), $b !== false && $b !== nil && $b != null ?theta['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "not a real")
      };
      return self.$new($rb_times(r, Opal.const_get($scopes, 'Math', true, true).$cos(theta)), $rb_times(r, Opal.const_get($scopes, 'Math', true, true).$sin(theta)));
    }, TMP_Complex_polar_2.$$arity = -2);
    self.$attr_reader("real", "imag");
    Opal.defn(self, '$initialize', TMP_Complex_initialize_3 = function $$initialize(real, imag) {
      var self = this;

      if (imag == null) {
        imag = 0;
      }
      
      self.real = real;
      return (self.imag = imag);
    }, TMP_Complex_initialize_3.$$arity = -2);
    Opal.defn(self, '$coerce', TMP_Complex_coerce_4 = function $$coerce(other) {
      var $a, $b, self = this;

      if ((($a = Opal.const_get($scopes, 'Complex', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [other, self]
      } else if ((($a = ($b = Opal.const_get($scopes, 'Numeric', true, true)['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return [Opal.const_get($scopes, 'Complex', true, true).$new(other, 0), self]
        } else {
        return self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + (other.$class()) + " can't be coerced into Complex")
      }
    }, TMP_Complex_coerce_4.$$arity = 1);
    Opal.defn(self, '$==', TMP_Complex_$eq$eq_5 = function(other) {
      var $a, $b, self = this;

      if ((($a = Opal.const_get($scopes, 'Complex', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return (($a = self.real['$=='](other.$real())) ? self.imag['$=='](other.$imag()) : self.real['$=='](other.$real()))
      } else if ((($a = ($b = Opal.const_get($scopes, 'Numeric', true, true)['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return (($a = self.real['$=='](other)) ? self.imag['$=='](0) : self.real['$=='](other))
        } else {
        return other['$=='](self)
      }
    }, TMP_Complex_$eq$eq_5.$$arity = 1);
    Opal.defn(self, '$-@', TMP_Complex_$$_6 = function() {
      var self = this;

      return self.$Complex(self.real['$-@'](), self.imag['$-@']())
    }, TMP_Complex_$$_6.$$arity = 0);
    Opal.defn(self, '$+', TMP_Complex_$_7 = function(other) {
      var $a, $b, self = this;

      if ((($a = Opal.const_get($scopes, 'Complex', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_plus(self.real, other.$real()), $rb_plus(self.imag, other.$imag()))
      } else if ((($a = ($b = Opal.const_get($scopes, 'Numeric', true, true)['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_plus(self.real, other), self.imag)
        } else {
        return self.$__coerced__("+", other)
      }
    }, TMP_Complex_$_7.$$arity = 1);
    Opal.defn(self, '$-', TMP_Complex_$_8 = function(other) {
      var $a, $b, self = this;

      if ((($a = Opal.const_get($scopes, 'Complex', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_minus(self.real, other.$real()), $rb_minus(self.imag, other.$imag()))
      } else if ((($a = ($b = Opal.const_get($scopes, 'Numeric', true, true)['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_minus(self.real, other), self.imag)
        } else {
        return self.$__coerced__("-", other)
      }
    }, TMP_Complex_$_8.$$arity = 1);
    Opal.defn(self, '$*', TMP_Complex_$_9 = function(other) {
      var $a, $b, self = this;

      if ((($a = Opal.const_get($scopes, 'Complex', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_minus($rb_times(self.real, other.$real()), $rb_times(self.imag, other.$imag())), $rb_plus($rb_times(self.real, other.$imag()), $rb_times(self.imag, other.$real())))
      } else if ((($a = ($b = Opal.const_get($scopes, 'Numeric', true, true)['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex($rb_times(self.real, other), $rb_times(self.imag, other))
        } else {
        return self.$__coerced__("*", other)
      }
    }, TMP_Complex_$_9.$$arity = 1);
    Opal.defn(self, '$/', TMP_Complex_$_10 = function(other) {
      var $a, $b, $c, $d, $e, self = this;

      if ((($a = Opal.const_get($scopes, 'Complex', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = ((($b = ((($c = ((($d = ($e = Opal.const_get($scopes, 'Number', true, true)['$==='](self.real), $e !== false && $e !== nil && $e != null ?self.real['$nan?']() : $e)) !== false && $d !== nil && $d != null) ? $d : ($e = Opal.const_get($scopes, 'Number', true, true)['$==='](self.imag), $e !== false && $e !== nil && $e != null ?self.imag['$nan?']() : $e))) !== false && $c !== nil && $c != null) ? $c : ($d = Opal.const_get($scopes, 'Number', true, true)['$==='](other.$real()), $d !== false && $d !== nil && $d != null ?other.$real()['$nan?']() : $d))) !== false && $b !== nil && $b != null) ? $b : ($c = Opal.const_get($scopes, 'Number', true, true)['$==='](other.$imag()), $c !== false && $c !== nil && $c != null ?other.$imag()['$nan?']() : $c))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return Opal.const_get($scopes, 'Complex', true, true).$new(Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'NAN', true, true), Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'NAN', true, true))
          } else {
          return $rb_divide($rb_times(self, other.$conj()), other.$abs2())
        }
      } else if ((($a = ($b = Opal.const_get($scopes, 'Numeric', true, true)['$==='](other), $b !== false && $b !== nil && $b != null ?other['$real?']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Complex(self.real.$quo(other), self.imag.$quo(other))
        } else {
        return self.$__coerced__("/", other)
      }
    }, TMP_Complex_$_10.$$arity = 1);
    Opal.defn(self, '$**', TMP_Complex_$$_11 = function(other) {
      var $a, $b, $c, $d, $e, self = this, r = nil, theta = nil, ore = nil, oim = nil, nr = nil, ntheta = nil, x = nil, z = nil, n = nil, div = nil, mod = nil;

      
      if (other['$=='](0)) {
        return Opal.const_get($scopes, 'Complex', true, true).$new(1, 0)};
      if ((($a = Opal.const_get($scopes, 'Complex', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        $b = self.$polar(), $a = Opal.to_ary($b), (r = ($a[0] == null ? nil : $a[0])), (theta = ($a[1] == null ? nil : $a[1])), $b;
        ore = other.$real();
        oim = other.$imag();
        nr = Opal.const_get($scopes, 'Math', true, true).$exp($rb_minus($rb_times(ore, Opal.const_get($scopes, 'Math', true, true).$log(r)), $rb_times(oim, theta)));
        ntheta = $rb_plus($rb_times(theta, ore), $rb_times(oim, Opal.const_get($scopes, 'Math', true, true).$log(r)));
        return Opal.const_get($scopes, 'Complex', true, true).$polar(nr, ntheta);
      } else if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = $rb_gt(other, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          
          x = self;
          z = x;
          n = $rb_minus(other, 1);
          while ((($b = n['$!='](0)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          
          while ((($c = ($e = n.$divmod(2), $d = Opal.to_ary($e), (div = ($d[0] == null ? nil : $d[0])), (mod = ($d[1] == null ? nil : $d[1])), $e, mod['$=='](0))) !== nil && $c != null && (!$c.$$is_boolean || $c == true))) {
          
          x = self.$Complex($rb_minus($rb_times(x.$real(), x.$real()), $rb_times(x.$imag(), x.$imag())), $rb_times($rb_times(2, x.$real()), x.$imag()));
          n = div;};
          (z = $rb_times(z, x));
          (n = $rb_minus(n, 1));};
          return z;
          } else {
          return $rb_divide(Opal.const_get($scopes, 'Rational', true, true).$new(1, 1), self)['$**'](other['$-@']())
        }
      } else if ((($a = ((($b = Opal.const_get($scopes, 'Float', true, true)['$==='](other)) !== false && $b !== nil && $b != null) ? $b : Opal.const_get($scopes, 'Rational', true, true)['$==='](other))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        $b = self.$polar(), $a = Opal.to_ary($b), (r = ($a[0] == null ? nil : $a[0])), (theta = ($a[1] == null ? nil : $a[1])), $b;
        return Opal.const_get($scopes, 'Complex', true, true).$polar(r['$**'](other), $rb_times(theta, other));
        } else {
        return self.$__coerced__("**", other)
      };
    }, TMP_Complex_$$_11.$$arity = 1);
    Opal.defn(self, '$abs', TMP_Complex_abs_12 = function $$abs() {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$hypot(self.real, self.imag)
    }, TMP_Complex_abs_12.$$arity = 0);
    Opal.defn(self, '$abs2', TMP_Complex_abs2_13 = function $$abs2() {
      var self = this;

      return $rb_plus($rb_times(self.real, self.real), $rb_times(self.imag, self.imag))
    }, TMP_Complex_abs2_13.$$arity = 0);
    Opal.defn(self, '$angle', TMP_Complex_angle_14 = function $$angle() {
      var self = this;

      return Opal.const_get($scopes, 'Math', true, true).$atan2(self.imag, self.real)
    }, TMP_Complex_angle_14.$$arity = 0);
    Opal.alias(self, "arg", "angle");
    Opal.defn(self, '$conj', TMP_Complex_conj_15 = function $$conj() {
      var self = this;

      return self.$Complex(self.real, self.imag['$-@']())
    }, TMP_Complex_conj_15.$$arity = 0);
    Opal.alias(self, "conjugate", "conj");
    Opal.defn(self, '$denominator', TMP_Complex_denominator_16 = function $$denominator() {
      var self = this;

      return self.real.$denominator().$lcm(self.imag.$denominator())
    }, TMP_Complex_denominator_16.$$arity = 0);
    Opal.alias(self, "divide", "/");
    Opal.defn(self, '$eql?', TMP_Complex_eql$q_17 = function(other) {
      var $a, $b, self = this;

      return ($a = ($b = Opal.const_get($scopes, 'Complex', true, true)['$==='](other), $b !== false && $b !== nil && $b != null ?self.real.$class()['$=='](self.imag.$class()) : $b), $a !== false && $a !== nil && $a != null ?self['$=='](other) : $a)
    }, TMP_Complex_eql$q_17.$$arity = 1);
    Opal.defn(self, '$fdiv', TMP_Complex_fdiv_18 = function $$fdiv(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Numeric', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + (other.$class()) + " can't be coerced into Complex")
      };
      return $rb_divide(self, other);
    }, TMP_Complex_fdiv_18.$$arity = 1);
    Opal.defn(self, '$hash', TMP_Complex_hash_19 = function $$hash() {
      var self = this;

      return "" + "Complex:" + (self.real) + ":" + (self.imag)
    }, TMP_Complex_hash_19.$$arity = 0);
    Opal.alias(self, "imaginary", "imag");
    Opal.defn(self, '$inspect', TMP_Complex_inspect_20 = function $$inspect() {
      var self = this;

      return "" + "(" + (self.$to_s()) + ")"
    }, TMP_Complex_inspect_20.$$arity = 0);
    Opal.alias(self, "magnitude", "abs");
    
    Opal.udef(self, '$' + "negative?");;
    Opal.defn(self, '$numerator', TMP_Complex_numerator_21 = function $$numerator() {
      var self = this, d = nil;

      
      d = self.$denominator();
      return self.$Complex($rb_times(self.real.$numerator(), $rb_divide(d, self.real.$denominator())), $rb_times(self.imag.$numerator(), $rb_divide(d, self.imag.$denominator())));
    }, TMP_Complex_numerator_21.$$arity = 0);
    Opal.alias(self, "phase", "arg");
    Opal.defn(self, '$polar', TMP_Complex_polar_22 = function $$polar() {
      var self = this;

      return [self.$abs(), self.$arg()]
    }, TMP_Complex_polar_22.$$arity = 0);
    
    Opal.udef(self, '$' + "positive?");;
    Opal.alias(self, "quo", "/");
    Opal.defn(self, '$rationalize', TMP_Complex_rationalize_23 = function $$rationalize(eps) {
      var $a, self = this;

      
      
      if (arguments.length > 1) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (arguments.length) + " for 0..1)");
      }
    ;
      if ((($a = self.imag['$!='](0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "" + "can't' convert " + (self) + " into Rational")};
      return self.$real().$rationalize(eps);
    }, TMP_Complex_rationalize_23.$$arity = -1);
    Opal.defn(self, '$real?', TMP_Complex_real$q_24 = function() {
      var self = this;

      return false
    }, TMP_Complex_real$q_24.$$arity = 0);
    Opal.defn(self, '$rect', TMP_Complex_rect_25 = function $$rect() {
      var self = this;

      return [self.real, self.imag]
    }, TMP_Complex_rect_25.$$arity = 0);
    Opal.alias(self, "rectangular", "rect");
    Opal.defn(self, '$to_f', TMP_Complex_to_f_26 = function $$to_f() {
      var self = this;

      
      if (self.imag['$=='](0)) {
        } else {
        self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "" + "can't convert " + (self) + " into Float")
      };
      return self.real.$to_f();
    }, TMP_Complex_to_f_26.$$arity = 0);
    Opal.defn(self, '$to_i', TMP_Complex_to_i_27 = function $$to_i() {
      var self = this;

      
      if (self.imag['$=='](0)) {
        } else {
        self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "" + "can't convert " + (self) + " into Integer")
      };
      return self.real.$to_i();
    }, TMP_Complex_to_i_27.$$arity = 0);
    Opal.defn(self, '$to_r', TMP_Complex_to_r_28 = function $$to_r() {
      var self = this;

      
      if (self.imag['$=='](0)) {
        } else {
        self.$raise(Opal.const_get($scopes, 'RangeError', true, true), "" + "can't convert " + (self) + " into Rational")
      };
      return self.real.$to_r();
    }, TMP_Complex_to_r_28.$$arity = 0);
    Opal.defn(self, '$to_s', TMP_Complex_to_s_29 = function $$to_s() {
      var $a, $b, $c, $d, self = this, result = nil;

      
      result = self.real.$inspect();
      if ((($a = ((($b = ((($c = ($d = Opal.const_get($scopes, 'Number', true, true)['$==='](self.imag), $d !== false && $d !== nil && $d != null ?self.imag['$nan?']() : $d)) !== false && $c !== nil && $c != null) ? $c : self.imag['$positive?']())) !== false && $b !== nil && $b != null) ? $b : self.imag['$zero?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        (result = $rb_plus(result, "+"))
        } else {
        (result = $rb_plus(result, "-"))
      };
      (result = $rb_plus(result, self.imag.$abs().$inspect()));
      if ((($a = ($b = Opal.const_get($scopes, 'Number', true, true)['$==='](self.imag), $b !== false && $b !== nil && $b != null ?((($c = self.imag['$nan?']()) !== false && $c !== nil && $c != null) ? $c : self.imag['$infinite?']()) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        (result = $rb_plus(result, "*"))};
      return $rb_plus(result, "i");
    }, TMP_Complex_to_s_29.$$arity = 0);
    return Opal.cdecl($scope, 'I', self.$new(0, 1));
  })($scope.base, Opal.const_get($scopes, 'Numeric', true, true), $scopes);
  return (function($base, $visibility_scopes) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Kernel_Complex_30;

    Opal.defn(self, '$Complex', TMP_Kernel_Complex_30 = function $$Complex(real, imag) {
      var self = this;

      if (imag == null) {
        imag = nil;
      }
      if (imag !== false && imag !== nil && imag != null) {
        return Opal.const_get($scopes, 'Complex', true, true).$new(real, imag)
        } else {
        return Opal.const_get($scopes, 'Complex', true, true).$new(real, 0)
      }
    }, TMP_Kernel_Complex_30.$$arity = -2)
  })($scope.base, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/rational"] = function(Opal) {
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_times(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs * rhs : lhs['$*'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$require', '$to_i', '$==', '$raise', '$<', '$-@', '$new', '$gcd', '$/', '$nil?', '$===', '$reduce', '$to_r', '$equal?', '$!', '$coerce_to!', '$attr_reader', '$to_f', '$numerator', '$denominator', '$<=>', '$-', '$*', '$__coerced__', '$+', '$Rational', '$>', '$**', '$abs', '$ceil', '$with_precision', '$floor', '$to_s', '$<=', '$truncate', '$send', '$convert']);
  
  self.$require("corelib/numeric");
  (function($base, $super, $visibility_scopes) {
    function $Rational(){};
    var self = $Rational = $klass($base, $super, 'Rational', $Rational);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Rational_reduce_1, TMP_Rational_convert_2, TMP_Rational_initialize_3, TMP_Rational_numerator_4, TMP_Rational_denominator_5, TMP_Rational_coerce_6, TMP_Rational_$eq$eq_7, TMP_Rational_$lt$eq$gt_8, TMP_Rational_$_9, TMP_Rational_$_10, TMP_Rational_$_11, TMP_Rational_$_12, TMP_Rational_$$_13, TMP_Rational_abs_14, TMP_Rational_ceil_15, TMP_Rational_floor_16, TMP_Rational_hash_17, TMP_Rational_inspect_18, TMP_Rational_rationalize_19, TMP_Rational_round_20, TMP_Rational_to_f_21, TMP_Rational_to_i_22, TMP_Rational_to_r_23, TMP_Rational_to_s_24, TMP_Rational_truncate_25, TMP_Rational_with_precision_26;

    def.num = def.den = nil;
    
    Opal.defs(self, '$reduce', TMP_Rational_reduce_1 = function $$reduce(num, den) {
      var $a, self = this, gcd = nil;

      
      num = num.$to_i();
      den = den.$to_i();
      if (den['$=='](0)) {
        self.$raise(Opal.const_get($scopes, 'ZeroDivisionError', true, true), "divided by 0")
      } else if ((($a = $rb_lt(den, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        num = num['$-@']();
        den = den['$-@']();
      } else if (den['$=='](1)) {
        return self.$new(num, den)};
      gcd = num.$gcd(den);
      return self.$new($rb_divide(num, gcd), $rb_divide(den, gcd));
    }, TMP_Rational_reduce_1.$$arity = 2);
    Opal.defs(self, '$convert', TMP_Rational_convert_2 = function $$convert(num, den) {
      var $a, $b, $c, self = this;

      
      if ((($a = ((($b = num['$nil?']()) !== false && $b !== nil && $b != null) ? $b : den['$nil?']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "cannot convert nil into Rational")};
      if ((($a = ($b = Opal.const_get($scopes, 'Integer', true, true)['$==='](num), $b !== false && $b !== nil && $b != null ?Opal.const_get($scopes, 'Integer', true, true)['$==='](den) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$reduce(num, den)};
      if ((($a = ((($b = ((($c = Opal.const_get($scopes, 'Float', true, true)['$==='](num)) !== false && $c !== nil && $c != null) ? $c : Opal.const_get($scopes, 'String', true, true)['$==='](num))) !== false && $b !== nil && $b != null) ? $b : Opal.const_get($scopes, 'Complex', true, true)['$==='](num))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        num = num.$to_r()};
      if ((($a = ((($b = ((($c = Opal.const_get($scopes, 'Float', true, true)['$==='](den)) !== false && $c !== nil && $c != null) ? $c : Opal.const_get($scopes, 'String', true, true)['$==='](den))) !== false && $b !== nil && $b != null) ? $b : Opal.const_get($scopes, 'Complex', true, true)['$==='](den))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        den = den.$to_r()};
      if ((($a = ($b = den['$equal?'](1), $b !== false && $b !== nil && $b != null ?Opal.const_get($scopes, 'Integer', true, true)['$==='](num)['$!']() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](num, Opal.const_get($scopes, 'Rational', true, true), "to_r")
      } else if ((($a = ($b = Opal.const_get($scopes, 'Numeric', true, true)['$==='](num), $b !== false && $b !== nil && $b != null ?Opal.const_get($scopes, 'Numeric', true, true)['$==='](den) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $rb_divide(num, den)
        } else {
        return self.$reduce(num, den)
      };
    }, TMP_Rational_convert_2.$$arity = 2);
    self.$attr_reader("numerator", "denominator");
    Opal.defn(self, '$initialize', TMP_Rational_initialize_3 = function $$initialize(num, den) {
      var self = this;

      
      self.num = num;
      return (self.den = den);
    }, TMP_Rational_initialize_3.$$arity = 2);
    Opal.defn(self, '$numerator', TMP_Rational_numerator_4 = function $$numerator() {
      var self = this;

      return self.num
    }, TMP_Rational_numerator_4.$$arity = 0);
    Opal.defn(self, '$denominator', TMP_Rational_denominator_5 = function $$denominator() {
      var self = this;

      return self.den
    }, TMP_Rational_denominator_5.$$arity = 0);
    Opal.defn(self, '$coerce', TMP_Rational_coerce_6 = function $$coerce(other) {
      var self = this, $case = nil;

      return (function() {$case = other;
if (Opal.const_get($scopes, 'Rational', true, true)['$===']($case)) {return [other, self]}else if (Opal.const_get($scopes, 'Integer', true, true)['$===']($case)) {return [other.$to_r(), self]}else if (Opal.const_get($scopes, 'Float', true, true)['$===']($case)) {return [other, self.$to_f()]}else { return nil }})()
    }, TMP_Rational_coerce_6.$$arity = 1);
    Opal.defn(self, '$==', TMP_Rational_$eq$eq_7 = function(other) {
      var $a, self = this, $case = nil;

      return (function() {$case = other;
if (Opal.const_get($scopes, 'Rational', true, true)['$===']($case)) {return (($a = self.num['$=='](other.$numerator())) ? self.den['$=='](other.$denominator()) : self.num['$=='](other.$numerator()))}else if (Opal.const_get($scopes, 'Integer', true, true)['$===']($case)) {return (($a = self.num['$=='](other)) ? self.den['$=='](1) : self.num['$=='](other))}else if (Opal.const_get($scopes, 'Float', true, true)['$===']($case)) {return self.$to_f()['$=='](other)}else {return other['$=='](self)}})()
    }, TMP_Rational_$eq$eq_7.$$arity = 1);
    Opal.defn(self, '$<=>', TMP_Rational_$lt$eq$gt_8 = function(other) {
      var self = this, $case = nil;

      return (function() {$case = other;
if (Opal.const_get($scopes, 'Rational', true, true)['$===']($case)) {return $rb_minus($rb_times(self.num, other.$denominator()), $rb_times(self.den, other.$numerator()))['$<=>'](0)}else if (Opal.const_get($scopes, 'Integer', true, true)['$===']($case)) {return $rb_minus(self.num, $rb_times(self.den, other))['$<=>'](0)}else if (Opal.const_get($scopes, 'Float', true, true)['$===']($case)) {return self.$to_f()['$<=>'](other)}else {return self.$__coerced__("<=>", other)}})()
    }, TMP_Rational_$lt$eq$gt_8.$$arity = 1);
    Opal.defn(self, '$+', TMP_Rational_$_9 = function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;
if (Opal.const_get($scopes, 'Rational', true, true)['$===']($case)) {
      num = $rb_plus($rb_times(self.num, other.$denominator()), $rb_times(self.den, other.$numerator()));
      den = $rb_times(self.den, other.$denominator());
      return self.$Rational(num, den);}else if (Opal.const_get($scopes, 'Integer', true, true)['$===']($case)) {return self.$Rational($rb_plus(self.num, $rb_times(other, self.den)), self.den)}else if (Opal.const_get($scopes, 'Float', true, true)['$===']($case)) {return $rb_plus(self.$to_f(), other)}else {return self.$__coerced__("+", other)}})()
    }, TMP_Rational_$_9.$$arity = 1);
    Opal.defn(self, '$-', TMP_Rational_$_10 = function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;
if (Opal.const_get($scopes, 'Rational', true, true)['$===']($case)) {
      num = $rb_minus($rb_times(self.num, other.$denominator()), $rb_times(self.den, other.$numerator()));
      den = $rb_times(self.den, other.$denominator());
      return self.$Rational(num, den);}else if (Opal.const_get($scopes, 'Integer', true, true)['$===']($case)) {return self.$Rational($rb_minus(self.num, $rb_times(other, self.den)), self.den)}else if (Opal.const_get($scopes, 'Float', true, true)['$===']($case)) {return $rb_minus(self.$to_f(), other)}else {return self.$__coerced__("-", other)}})()
    }, TMP_Rational_$_10.$$arity = 1);
    Opal.defn(self, '$*', TMP_Rational_$_11 = function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;
if (Opal.const_get($scopes, 'Rational', true, true)['$===']($case)) {
      num = $rb_times(self.num, other.$numerator());
      den = $rb_times(self.den, other.$denominator());
      return self.$Rational(num, den);}else if (Opal.const_get($scopes, 'Integer', true, true)['$===']($case)) {return self.$Rational($rb_times(self.num, other), self.den)}else if (Opal.const_get($scopes, 'Float', true, true)['$===']($case)) {return $rb_times(self.$to_f(), other)}else {return self.$__coerced__("*", other)}})()
    }, TMP_Rational_$_11.$$arity = 1);
    Opal.defn(self, '$/', TMP_Rational_$_12 = function(other) {
      var self = this, $case = nil, num = nil, den = nil;

      return (function() {$case = other;
if (Opal.const_get($scopes, 'Rational', true, true)['$===']($case)) {
      num = $rb_times(self.num, other.$denominator());
      den = $rb_times(self.den, other.$numerator());
      return self.$Rational(num, den);}else if (Opal.const_get($scopes, 'Integer', true, true)['$===']($case)) {if (other['$=='](0)) {
        return $rb_divide(self.$to_f(), 0.0)
        } else {
        return self.$Rational(self.num, $rb_times(self.den, other))
      }}else if (Opal.const_get($scopes, 'Float', true, true)['$===']($case)) {return $rb_divide(self.$to_f(), other)}else {return self.$__coerced__("/", other)}})()
    }, TMP_Rational_$_12.$$arity = 1);
    Opal.defn(self, '$**', TMP_Rational_$$_13 = function(other) {
      var $a, $b, self = this, $case = nil;

      return (function() {$case = other;
if (Opal.const_get($scopes, 'Integer', true, true)['$===']($case)) {if ((($a = (($b = self['$=='](0)) ? $rb_lt(other, 0) : self['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Opal.const_get([Opal.const_get($scopes, 'Float', true, true).$$scope], 'INFINITY', true, true)
      } else if ((($a = $rb_gt(other, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Rational(self.num['$**'](other), self.den['$**'](other))
      } else if ((($a = $rb_lt(other, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$Rational(self.den['$**'](other['$-@']()), self.num['$**'](other['$-@']()))
        } else {
        return self.$Rational(1, 1)
      }}else if (Opal.const_get($scopes, 'Float', true, true)['$===']($case)) {return self.$to_f()['$**'](other)}else if (Opal.const_get($scopes, 'Rational', true, true)['$===']($case)) {if (other['$=='](0)) {
        return self.$Rational(1, 1)
      } else if (other.$denominator()['$=='](1)) {
        if ((($a = $rb_lt(other, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self.$Rational(self.den['$**'](other.$numerator().$abs()), self.num['$**'](other.$numerator().$abs()))
          } else {
          return self.$Rational(self.num['$**'](other.$numerator()), self.den['$**'](other.$numerator()))
        }
      } else if ((($a = (($b = self['$=='](0)) ? $rb_lt(other, 0) : self['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$raise(Opal.const_get($scopes, 'ZeroDivisionError', true, true), "divided by 0")
        } else {
        return self.$to_f()['$**'](other)
      }}else {return self.$__coerced__("**", other)}})()
    }, TMP_Rational_$$_13.$$arity = 1);
    Opal.defn(self, '$abs', TMP_Rational_abs_14 = function $$abs() {
      var self = this;

      return self.$Rational(self.num.$abs(), self.den.$abs())
    }, TMP_Rational_abs_14.$$arity = 0);
    Opal.defn(self, '$ceil', TMP_Rational_ceil_15 = function $$ceil(precision) {
      var self = this;

      if (precision == null) {
        precision = 0;
      }
      if (precision['$=='](0)) {
        return $rb_divide(self.num['$-@'](), self.den)['$-@']().$ceil()
        } else {
        return self.$with_precision("ceil", precision)
      }
    }, TMP_Rational_ceil_15.$$arity = -1);
    Opal.alias(self, "divide", "/");
    Opal.defn(self, '$floor', TMP_Rational_floor_16 = function $$floor(precision) {
      var self = this;

      if (precision == null) {
        precision = 0;
      }
      if (precision['$=='](0)) {
        return $rb_divide(self.num['$-@'](), self.den)['$-@']().$floor()
        } else {
        return self.$with_precision("floor", precision)
      }
    }, TMP_Rational_floor_16.$$arity = -1);
    Opal.defn(self, '$hash', TMP_Rational_hash_17 = function $$hash() {
      var self = this;

      return "" + "Rational:" + (self.num) + ":" + (self.den)
    }, TMP_Rational_hash_17.$$arity = 0);
    Opal.defn(self, '$inspect', TMP_Rational_inspect_18 = function $$inspect() {
      var self = this;

      return "" + "(" + (self.$to_s()) + ")"
    }, TMP_Rational_inspect_18.$$arity = 0);
    Opal.alias(self, "quo", "/");
    Opal.defn(self, '$rationalize', TMP_Rational_rationalize_19 = function $$rationalize(eps) {
      var self = this;

      
      if (arguments.length > 1) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "wrong number of arguments (" + (arguments.length) + " for 0..1)");
      }

      if (eps == null) {
        return self;
      }

      var e = eps.$abs(),
          a = $rb_minus(self, e),
          b = $rb_plus(self, e);

      var p0 = 0,
          p1 = 1,
          q0 = 1,
          q1 = 0,
          p2, q2;

      var c, k, t;

      while (true) {
        c = (a).$ceil();

        if ($rb_le(c, b)) {
          break;
        }

        k  = c - 1;
        p2 = k * p1 + p0;
        q2 = k * q1 + q0;
        t  = $rb_divide(1, $rb_minus(b, k));
        b  = $rb_divide(1, $rb_minus(a, k));
        a  = t;

        p0 = p1;
        q0 = q1;
        p1 = p2;
        q1 = q2;
      }

      return self.$Rational(c * p1 + p0, c * q1 + q0);
    
    }, TMP_Rational_rationalize_19.$$arity = -1);
    Opal.defn(self, '$round', TMP_Rational_round_20 = function $$round(precision) {
      var $a, self = this, num = nil, den = nil, approx = nil;

      if (precision == null) {
        precision = 0;
      }
      
      if (precision['$=='](0)) {
        } else {
        return self.$with_precision("round", precision)
      };
      if (self.num['$=='](0)) {
        return 0};
      if (self.den['$=='](1)) {
        return self.num};
      num = $rb_plus($rb_times(self.num.$abs(), 2), self.den);
      den = $rb_times(self.den, 2);
      approx = $rb_divide(num, den).$truncate();
      if ((($a = $rb_lt(self.num, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return approx['$-@']()
        } else {
        return approx
      };
    }, TMP_Rational_round_20.$$arity = -1);
    Opal.defn(self, '$to_f', TMP_Rational_to_f_21 = function $$to_f() {
      var self = this;

      return $rb_divide(self.num, self.den)
    }, TMP_Rational_to_f_21.$$arity = 0);
    Opal.defn(self, '$to_i', TMP_Rational_to_i_22 = function $$to_i() {
      var self = this;

      return self.$truncate()
    }, TMP_Rational_to_i_22.$$arity = 0);
    Opal.defn(self, '$to_r', TMP_Rational_to_r_23 = function $$to_r() {
      var self = this;

      return self
    }, TMP_Rational_to_r_23.$$arity = 0);
    Opal.defn(self, '$to_s', TMP_Rational_to_s_24 = function $$to_s() {
      var self = this;

      return "" + (self.num) + "/" + (self.den)
    }, TMP_Rational_to_s_24.$$arity = 0);
    Opal.defn(self, '$truncate', TMP_Rational_truncate_25 = function $$truncate(precision) {
      var $a, self = this;

      if (precision == null) {
        precision = 0;
      }
      if (precision['$=='](0)) {
        if ((($a = $rb_lt(self.num, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return self.$ceil()
          } else {
          return self.$floor()
        }
        } else {
        return self.$with_precision("truncate", precision)
      }
    }, TMP_Rational_truncate_25.$$arity = -1);
    return (Opal.defn(self, '$with_precision', TMP_Rational_with_precision_26 = function $$with_precision(method, precision) {
      var $a, self = this, p = nil, s = nil;

      
      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](precision)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "not an Integer")
      };
      p = (10)['$**'](precision);
      s = $rb_times(self, p);
      if ((($a = $rb_lt(precision, 1)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return $rb_divide(s.$send(method), p).$to_i()
        } else {
        return self.$Rational(s.$send(method), p)
      };
    }, TMP_Rational_with_precision_26.$$arity = 2), nil) && 'with_precision';
  })($scope.base, Opal.const_get($scopes, 'Numeric', true, true), $scopes);
  return (function($base, $visibility_scopes) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Kernel_Rational_27;

    Opal.defn(self, '$Rational', TMP_Kernel_Rational_27 = function $$Rational(numerator, denominator) {
      var self = this;

      if (denominator == null) {
        denominator = 1;
      }
      return Opal.const_get($scopes, 'Rational', true, true).$convert(numerator, denominator)
    }, TMP_Kernel_Rational_27.$$arity = -2)
  })($scope.base, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/time"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  function $rb_divide(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs / rhs : lhs['$/'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_le(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs <= rhs : lhs['$<='](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $range = Opal.range;

  Opal.add_stubs(['$require', '$include', '$===', '$raise', '$coerce_to!', '$respond_to?', '$to_str', '$to_i', '$new', '$<=>', '$to_f', '$nil?', '$>', '$<', '$strftime', '$year', '$month', '$day', '$+', '$round', '$/', '$-', '$copy_instance_variables', '$initialize_dup', '$is_a?', '$zero?', '$wday', '$utc?', '$mon', '$yday', '$hour', '$min', '$sec', '$rjust', '$ljust', '$zone', '$to_s', '$[]', '$cweek_cyear', '$isdst', '$<=', '$!=', '$==', '$ceil']);
  
  self.$require("corelib/comparable");
  return (function($base, $super, $visibility_scopes) {
    function $Time(){};
    var self = $Time = $klass($base, $super, 'Time', $Time);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Time_at_1, TMP_Time_new_2, TMP_Time_local_3, TMP_Time_gm_4, TMP_Time_now_5, TMP_Time_$_6, TMP_Time_$_7, TMP_Time_$lt$eq$gt_8, TMP_Time_$eq$eq_9, TMP_Time_asctime_10, TMP_Time_day_11, TMP_Time_yday_12, TMP_Time_isdst_13, TMP_Time_dup_14, TMP_Time_eql$q_15, TMP_Time_friday$q_16, TMP_Time_hash_17, TMP_Time_hour_18, TMP_Time_inspect_19, TMP_Time_min_20, TMP_Time_mon_21, TMP_Time_monday$q_22, TMP_Time_saturday$q_23, TMP_Time_sec_24, TMP_Time_succ_25, TMP_Time_usec_26, TMP_Time_zone_27, TMP_Time_getgm_28, TMP_Time_gmtime_29, TMP_Time_gmt$q_30, TMP_Time_gmt_offset_31, TMP_Time_strftime_32, TMP_Time_sunday$q_33, TMP_Time_thursday$q_34, TMP_Time_to_a_35, TMP_Time_to_f_36, TMP_Time_to_i_37, TMP_Time_tuesday$q_38, TMP_Time_wday_39, TMP_Time_wednesday$q_40, TMP_Time_year_41, TMP_Time_cweek_cyear_42;

    
    self.$include(Opal.const_get($scopes, 'Comparable', true, true));
    
    var days_of_week = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        short_days   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        short_months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        long_months  = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  ;
    Opal.defs(self, '$at', TMP_Time_at_1 = function $$at(seconds, frac) {
      var self = this;

      
      var result;

      if (Opal.const_get($scopes, 'Time', true, true)['$==='](seconds)) {
        if (frac !== undefined) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "can't convert Time into an exact number")
        }
        result = new Date(seconds.getTime());
        result.is_utc = seconds.is_utc;
        return result;
      }

      if (!seconds.$$is_number) {
        seconds = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](seconds, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }

      if (frac === undefined) {
        return new Date(seconds * 1000);
      }

      if (!frac.$$is_number) {
        frac = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](frac, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }

      return new Date(seconds * 1000 + (frac / 1000));
    
    }, TMP_Time_at_1.$$arity = -2);
    
    function time_params(year, month, day, hour, min, sec) {
      if (year.$$is_string) {
        year = parseInt(year, 10);
      } else {
        year = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](year, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }

      if (month === nil) {
        month = 1;
      } else if (!month.$$is_number) {
        if ((month)['$respond_to?']("to_str")) {
          month = (month).$to_str();
          switch (month.toLowerCase()) {
          case 'jan': month =  1; break;
          case 'feb': month =  2; break;
          case 'mar': month =  3; break;
          case 'apr': month =  4; break;
          case 'may': month =  5; break;
          case 'jun': month =  6; break;
          case 'jul': month =  7; break;
          case 'aug': month =  8; break;
          case 'sep': month =  9; break;
          case 'oct': month = 10; break;
          case 'nov': month = 11; break;
          case 'dec': month = 12; break;
          default: month = (month).$to_i();
          }
        } else {
          month = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](month, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        }
      }

      if (month < 1 || month > 12) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "month out of range: " + (month))
      }
      month = month - 1;

      if (day === nil) {
        day = 1;
      } else if (day.$$is_string) {
        day = parseInt(day, 10);
      } else {
        day = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](day, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }

      if (day < 1 || day > 31) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "day out of range: " + (day))
      }

      if (hour === nil) {
        hour = 0;
      } else if (hour.$$is_string) {
        hour = parseInt(hour, 10);
      } else {
        hour = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](hour, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }

      if (hour < 0 || hour > 24) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "hour out of range: " + (hour))
      }

      if (min === nil) {
        min = 0;
      } else if (min.$$is_string) {
        min = parseInt(min, 10);
      } else {
        min = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](min, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }

      if (min < 0 || min > 59) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "min out of range: " + (min))
      }

      if (sec === nil) {
        sec = 0;
      } else if (!sec.$$is_number) {
        if (sec.$$is_string) {
          sec = parseInt(sec, 10);
        } else {
          sec = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](sec, Opal.const_get($scopes, 'Integer', true, true), "to_int");
        }
      }

      if (sec < 0 || sec > 60) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "sec out of range: " + (sec))
      }

      return [year, month, day, hour, min, sec];
    }
  ;
    Opal.defs(self, '$new', TMP_Time_new_2 = function(year, month, day, hour, min, sec, utc_offset) {
      var self = this;

      if (month == null) {
        month = nil;
      }
      if (day == null) {
        day = nil;
      }
      if (hour == null) {
        hour = nil;
      }
      if (min == null) {
        min = nil;
      }
      if (sec == null) {
        sec = nil;
      }
      if (utc_offset == null) {
        utc_offset = nil;
      }
      
      var args, result;

      if (year === undefined) {
        return new Date();
      }

      if (utc_offset !== nil) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "Opal does not support explicitly specifying UTC offset for Time")
      }

      args  = time_params(year, month, day, hour, min, sec);
      year  = args[0];
      month = args[1];
      day   = args[2];
      hour  = args[3];
      min   = args[4];
      sec   = args[5];

      result = new Date(year, month, day, hour, min, 0, sec * 1000);
      if (year < 100) {
        result.setFullYear(year);
      }
      return result;
    
    }, TMP_Time_new_2.$$arity = -1);
    Opal.defs(self, '$local', TMP_Time_local_3 = function $$local(year, month, day, hour, min, sec, millisecond, _dummy1, _dummy2, _dummy3) {
      var self = this;

      if (month == null) {
        month = nil;
      }
      if (day == null) {
        day = nil;
      }
      if (hour == null) {
        hour = nil;
      }
      if (min == null) {
        min = nil;
      }
      if (sec == null) {
        sec = nil;
      }
      if (millisecond == null) {
        millisecond = nil;
      }
      if (_dummy1 == null) {
        _dummy1 = nil;
      }
      if (_dummy2 == null) {
        _dummy2 = nil;
      }
      if (_dummy3 == null) {
        _dummy3 = nil;
      }
      
      var args, result;

      if (arguments.length === 10) {
        args  = $slice.call(arguments);
        year  = args[5];
        month = args[4];
        day   = args[3];
        hour  = args[2];
        min   = args[1];
        sec   = args[0];
      }

      args  = time_params(year, month, day, hour, min, sec);
      year  = args[0];
      month = args[1];
      day   = args[2];
      hour  = args[3];
      min   = args[4];
      sec   = args[5];

      result = new Date(year, month, day, hour, min, 0, sec * 1000);
      if (year < 100) {
        result.setFullYear(year);
      }
      return result;
    
    }, TMP_Time_local_3.$$arity = -2);
    Opal.defs(self, '$gm', TMP_Time_gm_4 = function $$gm(year, month, day, hour, min, sec, millisecond, _dummy1, _dummy2, _dummy3) {
      var self = this;

      if (month == null) {
        month = nil;
      }
      if (day == null) {
        day = nil;
      }
      if (hour == null) {
        hour = nil;
      }
      if (min == null) {
        min = nil;
      }
      if (sec == null) {
        sec = nil;
      }
      if (millisecond == null) {
        millisecond = nil;
      }
      if (_dummy1 == null) {
        _dummy1 = nil;
      }
      if (_dummy2 == null) {
        _dummy2 = nil;
      }
      if (_dummy3 == null) {
        _dummy3 = nil;
      }
      
      var args, result;

      if (arguments.length === 10) {
        args  = $slice.call(arguments);
        year  = args[5];
        month = args[4];
        day   = args[3];
        hour  = args[2];
        min   = args[1];
        sec   = args[0];
      }

      args  = time_params(year, month, day, hour, min, sec);
      year  = args[0];
      month = args[1];
      day   = args[2];
      hour  = args[3];
      min   = args[4];
      sec   = args[5];

      result = new Date(Date.UTC(year, month, day, hour, min, 0, sec * 1000));
      if (year < 100) {
        result.setUTCFullYear(year);
      }
      result.is_utc = true;
      return result;
    
    }, TMP_Time_gm_4.$$arity = -2);
    (function(self, $visibility_scopes) {
      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat(self);

      
      Opal.alias(self, "mktime", "local");
      return Opal.alias(self, "utc", "gm");
    })(Opal.get_singleton_class(self), $scopes);
    Opal.defs(self, '$now', TMP_Time_now_5 = function $$now() {
      var self = this;

      return self.$new()
    }, TMP_Time_now_5.$$arity = 0);
    Opal.defn(self, '$+', TMP_Time_$_6 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Time', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "time + time?")};
      
      if (!other.$$is_number) {
        other = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](other, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }
      var result = new Date(self.getTime() + (other * 1000));
      result.is_utc = self.is_utc;
      return result;
    ;
    }, TMP_Time_$_6.$$arity = 1);
    Opal.defn(self, '$-', TMP_Time_$_7 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Time', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return (self.getTime() - other.getTime()) / 1000};
      
      if (!other.$$is_number) {
        other = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](other, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      }
      var result = new Date(self.getTime() - (other * 1000));
      result.is_utc = self.is_utc;
      return result;
    ;
    }, TMP_Time_$_7.$$arity = 1);
    Opal.defn(self, '$<=>', TMP_Time_$lt$eq$gt_8 = function(other) {
      var $a, self = this, r = nil;

      if ((($a = Opal.const_get($scopes, 'Time', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$to_f()['$<=>'](other.$to_f())
        } else {
        
        r = other['$<=>'](self);
        if ((($a = r['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return nil
        } else if ((($a = $rb_gt(r, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return -1
        } else if ((($a = $rb_lt(r, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return 1
          } else {
          return 0
        };
      }
    }, TMP_Time_$lt$eq$gt_8.$$arity = 1);
    Opal.defn(self, '$==', TMP_Time_$eq$eq_9 = function(other) {
      var $a, self = this;

      return ($a = Opal.const_get($scopes, 'Time', true, true)['$==='](other), $a !== false && $a !== nil && $a != null ?self.$to_f() === other.$to_f() : $a)
    }, TMP_Time_$eq$eq_9.$$arity = 1);
    Opal.defn(self, '$asctime', TMP_Time_asctime_10 = function $$asctime() {
      var self = this;

      return self.$strftime("%a %b %e %H:%M:%S %Y")
    }, TMP_Time_asctime_10.$$arity = 0);
    Opal.alias(self, "ctime", "asctime");
    Opal.defn(self, '$day', TMP_Time_day_11 = function $$day() {
      var self = this;

      return self.is_utc ? self.getUTCDate() : self.getDate()
    }, TMP_Time_day_11.$$arity = 0);
    Opal.defn(self, '$yday', TMP_Time_yday_12 = function $$yday() {
      var self = this, start_of_year = nil, start_of_day = nil, one_day = nil;

      
      start_of_year = Opal.const_get($scopes, 'Time', true, true).$new(self.$year()).$to_i();
      start_of_day = Opal.const_get($scopes, 'Time', true, true).$new(self.$year(), self.$month(), self.$day()).$to_i();
      one_day = 86400;
      return $rb_plus($rb_divide($rb_minus(start_of_day, start_of_year), one_day).$round(), 1);
    }, TMP_Time_yday_12.$$arity = 0);
    Opal.defn(self, '$isdst', TMP_Time_isdst_13 = function $$isdst() {
      var self = this;

      
      var jan = new Date(self.getFullYear(), 0, 1),
          jul = new Date(self.getFullYear(), 6, 1);
      return self.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    
    }, TMP_Time_isdst_13.$$arity = 0);
    Opal.alias(self, "dst?", "isdst");
    Opal.defn(self, '$dup', TMP_Time_dup_14 = function $$dup() {
      var self = this, copy = nil;

      
      copy = new Date(self.getTime());
      copy.$copy_instance_variables(self);
      copy.$initialize_dup(self);
      return copy;
    }, TMP_Time_dup_14.$$arity = 0);
    Opal.defn(self, '$eql?', TMP_Time_eql$q_15 = function(other) {
      var $a, self = this;

      return ($a = other['$is_a?'](Opal.const_get($scopes, 'Time', true, true)), $a !== false && $a !== nil && $a != null ?self['$<=>'](other)['$zero?']() : $a)
    }, TMP_Time_eql$q_15.$$arity = 1);
    Opal.defn(self, '$friday?', TMP_Time_friday$q_16 = function() {
      var self = this;

      return self.$wday() == 5
    }, TMP_Time_friday$q_16.$$arity = 0);
    Opal.defn(self, '$hash', TMP_Time_hash_17 = function $$hash() {
      var self = this;

      return 'Time:' + self.getTime()
    }, TMP_Time_hash_17.$$arity = 0);
    Opal.defn(self, '$hour', TMP_Time_hour_18 = function $$hour() {
      var self = this;

      return self.is_utc ? self.getUTCHours() : self.getHours()
    }, TMP_Time_hour_18.$$arity = 0);
    Opal.defn(self, '$inspect', TMP_Time_inspect_19 = function $$inspect() {
      var $a, self = this;

      if ((($a = self['$utc?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return self.$strftime("%Y-%m-%d %H:%M:%S UTC")
        } else {
        return self.$strftime("%Y-%m-%d %H:%M:%S %z")
      }
    }, TMP_Time_inspect_19.$$arity = 0);
    Opal.alias(self, "mday", "day");
    Opal.defn(self, '$min', TMP_Time_min_20 = function $$min() {
      var self = this;

      return self.is_utc ? self.getUTCMinutes() : self.getMinutes()
    }, TMP_Time_min_20.$$arity = 0);
    Opal.defn(self, '$mon', TMP_Time_mon_21 = function $$mon() {
      var self = this;

      return (self.is_utc ? self.getUTCMonth() : self.getMonth()) + 1
    }, TMP_Time_mon_21.$$arity = 0);
    Opal.defn(self, '$monday?', TMP_Time_monday$q_22 = function() {
      var self = this;

      return self.$wday() == 1
    }, TMP_Time_monday$q_22.$$arity = 0);
    Opal.alias(self, "month", "mon");
    Opal.defn(self, '$saturday?', TMP_Time_saturday$q_23 = function() {
      var self = this;

      return self.$wday() == 6
    }, TMP_Time_saturday$q_23.$$arity = 0);
    Opal.defn(self, '$sec', TMP_Time_sec_24 = function $$sec() {
      var self = this;

      return self.is_utc ? self.getUTCSeconds() : self.getSeconds()
    }, TMP_Time_sec_24.$$arity = 0);
    Opal.defn(self, '$succ', TMP_Time_succ_25 = function $$succ() {
      var self = this;

      
      var result = new Date(self.getTime() + 1000);
      result.is_utc = self.is_utc;
      return result;
    
    }, TMP_Time_succ_25.$$arity = 0);
    Opal.defn(self, '$usec', TMP_Time_usec_26 = function $$usec() {
      var self = this;

      return self.getMilliseconds() * 1000
    }, TMP_Time_usec_26.$$arity = 0);
    Opal.defn(self, '$zone', TMP_Time_zone_27 = function $$zone() {
      var self = this;

      
      var string = self.toString(),
          result;

      if (string.indexOf('(') == -1) {
        result = string.match(/[A-Z]{3,4}/)[0];
      }
      else {
        result = string.match(/\([^)]+\)/)[0].match(/[A-Z]/g).join('');
      }

      if (result == "GMT" && /(GMT\W*\d{4})/.test(string)) {
        return RegExp.$1;
      }
      else {
        return result;
      }
    
    }, TMP_Time_zone_27.$$arity = 0);
    Opal.defn(self, '$getgm', TMP_Time_getgm_28 = function $$getgm() {
      var self = this;

      
      var result = new Date(self.getTime());
      result.is_utc = true;
      return result;
    
    }, TMP_Time_getgm_28.$$arity = 0);
    Opal.alias(self, "getutc", "getgm");
    Opal.defn(self, '$gmtime', TMP_Time_gmtime_29 = function $$gmtime() {
      var self = this;

      
      self.is_utc = true;
      return self;
    
    }, TMP_Time_gmtime_29.$$arity = 0);
    Opal.alias(self, "utc", "gmtime");
    Opal.defn(self, '$gmt?', TMP_Time_gmt$q_30 = function() {
      var self = this;

      return self.is_utc === true
    }, TMP_Time_gmt$q_30.$$arity = 0);
    Opal.defn(self, '$gmt_offset', TMP_Time_gmt_offset_31 = function $$gmt_offset() {
      var self = this;

      return -self.getTimezoneOffset() * 60
    }, TMP_Time_gmt_offset_31.$$arity = 0);
    Opal.defn(self, '$strftime', TMP_Time_strftime_32 = function $$strftime(format) {
      var self = this;

      
      return format.replace(/%([\-_#^0]*:{0,2})(\d+)?([EO]*)(.)/g, function(full, flags, width, _, conv) {
        var result = "",
            zero   = flags.indexOf('0') !== -1,
            pad    = flags.indexOf('-') === -1,
            blank  = flags.indexOf('_') !== -1,
            upcase = flags.indexOf('^') !== -1,
            invert = flags.indexOf('#') !== -1,
            colons = (flags.match(':') || []).length;

        width = parseInt(width, 10);

        if (zero && blank) {
          if (flags.indexOf('0') < flags.indexOf('_')) {
            zero = false;
          }
          else {
            blank = false;
          }
        }

        switch (conv) {
          case 'Y':
            result += self.$year();
            break;

          case 'C':
            zero    = !blank;
            result += Math.round(self.$year() / 100);
            break;

          case 'y':
            zero    = !blank;
            result += (self.$year() % 100);
            break;

          case 'm':
            zero    = !blank;
            result += self.$mon();
            break;

          case 'B':
            result += long_months[self.$mon() - 1];
            break;

          case 'b':
          case 'h':
            blank   = !zero;
            result += short_months[self.$mon() - 1];
            break;

          case 'd':
            zero    = !blank
            result += self.$day();
            break;

          case 'e':
            blank   = !zero
            result += self.$day();
            break;

          case 'j':
            result += self.$yday();
            break;

          case 'H':
            zero    = !blank;
            result += self.$hour();
            break;

          case 'k':
            blank   = !zero;
            result += self.$hour();
            break;

          case 'I':
            zero    = !blank;
            result += (self.$hour() % 12 || 12);
            break;

          case 'l':
            blank   = !zero;
            result += (self.$hour() % 12 || 12);
            break;

          case 'P':
            result += (self.$hour() >= 12 ? "pm" : "am");
            break;

          case 'p':
            result += (self.$hour() >= 12 ? "PM" : "AM");
            break;

          case 'M':
            zero    = !blank;
            result += self.$min();
            break;

          case 'S':
            zero    = !blank;
            result += self.$sec()
            break;

          case 'L':
            zero    = !blank;
            width   = isNaN(width) ? 3 : width;
            result += self.getMilliseconds();
            break;

          case 'N':
            width   = isNaN(width) ? 9 : width;
            result += (self.getMilliseconds().toString()).$rjust(3, "0");
            result  = (result).$ljust(width, "0");
            break;

          case 'z':
            var offset  = self.getTimezoneOffset(),
                hours   = Math.floor(Math.abs(offset) / 60),
                minutes = Math.abs(offset) % 60;

            result += offset < 0 ? "+" : "-";
            result += hours < 10 ? "0" : "";
            result += hours;

            if (colons > 0) {
              result += ":";
            }

            result += minutes < 10 ? "0" : "";
            result += minutes;

            if (colons > 1) {
              result += ":00";
            }

            break;

          case 'Z':
            result += self.$zone();
            break;

          case 'A':
            result += days_of_week[self.$wday()];
            break;

          case 'a':
            result += short_days[self.$wday()];
            break;

          case 'u':
            result += (self.$wday() + 1);
            break;

          case 'w':
            result += self.$wday();
            break;

          case 'V':
            result += self.$cweek_cyear()['$[]'](0).$to_s().$rjust(2, "0");
            break;

          case 'G':
            result += self.$cweek_cyear()['$[]'](1);
            break;

          case 'g':
            result += self.$cweek_cyear()['$[]'](1)['$[]']($range(-2, -1, false));
            break;

          case 's':
            result += self.$to_i();
            break;

          case 'n':
            result += "\n";
            break;

          case 't':
            result += "\t";
            break;

          case '%':
            result += "%";
            break;

          case 'c':
            result += self.$strftime("%a %b %e %T %Y");
            break;

          case 'D':
          case 'x':
            result += self.$strftime("%m/%d/%y");
            break;

          case 'F':
            result += self.$strftime("%Y-%m-%d");
            break;

          case 'v':
            result += self.$strftime("%e-%^b-%4Y");
            break;

          case 'r':
            result += self.$strftime("%I:%M:%S %p");
            break;

          case 'R':
            result += self.$strftime("%H:%M");
            break;

          case 'T':
          case 'X':
            result += self.$strftime("%H:%M:%S");
            break;

          default:
            return full;
        }

        if (upcase) {
          result = result.toUpperCase();
        }

        if (invert) {
          result = result.replace(/[A-Z]/, function(c) { c.toLowerCase() }).
                          replace(/[a-z]/, function(c) { c.toUpperCase() });
        }

        if (pad && (zero || blank)) {
          result = (result).$rjust(isNaN(width) ? 2 : width, blank ? " " : "0");
        }

        return result;
      });
    
    }, TMP_Time_strftime_32.$$arity = 1);
    Opal.defn(self, '$sunday?', TMP_Time_sunday$q_33 = function() {
      var self = this;

      return self.$wday() == 0
    }, TMP_Time_sunday$q_33.$$arity = 0);
    Opal.defn(self, '$thursday?', TMP_Time_thursday$q_34 = function() {
      var self = this;

      return self.$wday() == 4
    }, TMP_Time_thursday$q_34.$$arity = 0);
    Opal.defn(self, '$to_a', TMP_Time_to_a_35 = function $$to_a() {
      var self = this;

      return [self.$sec(), self.$min(), self.$hour(), self.$day(), self.$month(), self.$year(), self.$wday(), self.$yday(), self.$isdst(), self.$zone()]
    }, TMP_Time_to_a_35.$$arity = 0);
    Opal.defn(self, '$to_f', TMP_Time_to_f_36 = function $$to_f() {
      var self = this;

      return self.getTime() / 1000
    }, TMP_Time_to_f_36.$$arity = 0);
    Opal.defn(self, '$to_i', TMP_Time_to_i_37 = function $$to_i() {
      var self = this;

      return parseInt(self.getTime() / 1000, 10)
    }, TMP_Time_to_i_37.$$arity = 0);
    Opal.alias(self, "to_s", "inspect");
    Opal.defn(self, '$tuesday?', TMP_Time_tuesday$q_38 = function() {
      var self = this;

      return self.$wday() == 2
    }, TMP_Time_tuesday$q_38.$$arity = 0);
    Opal.alias(self, "tv_sec", "to_i");
    Opal.alias(self, "tv_usec", "usec");
    Opal.alias(self, "utc?", "gmt?");
    Opal.alias(self, "gmtoff", "gmt_offset");
    Opal.alias(self, "utc_offset", "gmt_offset");
    Opal.defn(self, '$wday', TMP_Time_wday_39 = function $$wday() {
      var self = this;

      return self.is_utc ? self.getUTCDay() : self.getDay()
    }, TMP_Time_wday_39.$$arity = 0);
    Opal.defn(self, '$wednesday?', TMP_Time_wednesday$q_40 = function() {
      var self = this;

      return self.$wday() == 3
    }, TMP_Time_wednesday$q_40.$$arity = 0);
    Opal.defn(self, '$year', TMP_Time_year_41 = function $$year() {
      var self = this;

      return self.is_utc ? self.getUTCFullYear() : self.getFullYear()
    }, TMP_Time_year_41.$$arity = 0);
    return (Opal.defn(self, '$cweek_cyear', TMP_Time_cweek_cyear_42 = function $$cweek_cyear() {
      var $a, $b, self = this, jan01 = nil, jan01_wday = nil, first_monday = nil, year = nil, offset = nil, week = nil, dec31 = nil, dec31_wday = nil;

      
      jan01 = Opal.const_get($scopes, 'Time', true, true).$new(self.$year(), 1, 1);
      jan01_wday = jan01.$wday();
      first_monday = 0;
      year = self.$year();
      if ((($a = ($b = $rb_le(jan01_wday, 4), $b !== false && $b !== nil && $b != null ?jan01_wday['$!='](0) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        offset = $rb_minus(jan01_wday, 1)
        } else {
        
        offset = $rb_minus($rb_minus(jan01_wday, 7), 1);
        if (offset['$=='](-8)) {
          offset = -1};
      };
      week = $rb_divide($rb_plus(self.$yday(), offset), 7.0).$ceil();
      if ((($a = $rb_le(week, 0)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        return Opal.const_get($scopes, 'Time', true, true).$new($rb_minus(self.$year(), 1), 12, 31).$cweek_cyear()
      } else if (week['$=='](53)) {
        
        dec31 = Opal.const_get($scopes, 'Time', true, true).$new(self.$year(), 12, 31);
        dec31_wday = dec31.$wday();
        if ((($a = ($b = $rb_le(dec31_wday, 3), $b !== false && $b !== nil && $b != null ?dec31_wday['$!='](0) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          
          week = 1;
          (year = $rb_plus(year, 1));};};
      return [week, year];
    }, TMP_Time_cweek_cyear_42.$$arity = 0), nil) && 'cweek_cyear';
  })($scope.base, Date, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/struct"] = function(Opal) {
  function $rb_gt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs > rhs : lhs['$>'](rhs);
  }
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_lt(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs < rhs : lhs['$<'](rhs);
  }
  function $rb_ge(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs >= rhs : lhs['$>='](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send, $hash2 = Opal.hash2;

  Opal.add_stubs(['$require', '$include', '$const_name!', '$unshift', '$map', '$coerce_to!', '$new', '$each', '$define_struct_attribute', '$allocate', '$initialize', '$module_eval', '$to_proc', '$const_set', '$==', '$raise', '$<<', '$members', '$define_method', '$instance_eval', '$>', '$length', '$class', '$each_with_index', '$[]', '$[]=', '$-', '$hash', '$===', '$<', '$-@', '$size', '$>=', '$include?', '$to_sym', '$instance_of?', '$__id__', '$eql?', '$enum_for', '$name', '$+', '$join', '$each_pair', '$inspect', '$inject', '$flatten', '$to_a', '$respond_to?', '$dig', '$values_at']);
  
  self.$require("corelib/enumerable");
  return (function($base, $super, $visibility_scopes) {
    function $Struct(){};
    var self = $Struct = $klass($base, $super, 'Struct', $Struct);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Struct_new_1, TMP_Struct_define_struct_attribute_8, TMP_Struct_members_9, TMP_Struct_inherited_11, TMP_Struct_initialize_13, TMP_Struct_members_14, TMP_Struct_hash_15, TMP_Struct_$$_16, TMP_Struct_$$$eq_17, TMP_Struct_$eq$eq_18, TMP_Struct_eql$q_19, TMP_Struct_each_20, TMP_Struct_each_pair_23, TMP_Struct_length_26, TMP_Struct_to_a_28, TMP_Struct_inspect_30, TMP_Struct_to_h_32, TMP_Struct_values_at_34, TMP_Struct_dig_35, TMP_Struct__load_36;

    
    self.$include(Opal.const_get($scopes, 'Enumerable', true, true));
    Opal.defs(self, '$new', TMP_Struct_new_1 = function(const_name, $a_rest) {
      var TMP_2, TMP_3, self = this, args, $iter = TMP_Struct_new_1.$$p, block = $iter || nil, klass = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 1] = arguments[$arg_idx];
      }
      TMP_Struct_new_1.$$p = null;
      
      if (const_name !== false && const_name !== nil && const_name != null) {
        
        try {
          const_name = Opal.const_get($scopes, 'Opal', true, true)['$const_name!'](const_name)
        } catch ($err) {
          if (Opal.rescue($err, [Opal.const_get($scopes, 'TypeError', true, true), Opal.const_get($scopes, 'NameError', true, true)])) {
            try {
              
              args.$unshift(const_name);
              const_name = nil;
            } finally { Opal.pop_exception() }
          } else { throw $err; }
        };};
      $send(args, 'map', [], (TMP_2 = function(arg){var self = TMP_2.$$s || this;
if (arg == null) arg = nil;
      return Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](arg, Opal.const_get($scopes, 'String', true, true), "to_str")}, TMP_2.$$s = self, TMP_2.$$arity = 1, TMP_2));
      klass = $send(Opal.const_get($scopes, 'Class', true, true), 'new', [self], (TMP_3 = function(){var self = TMP_3.$$s || this, TMP_4;

      
        $send(args, 'each', [], (TMP_4 = function(arg){var self = TMP_4.$$s || this;
if (arg == null) arg = nil;
        return self.$define_struct_attribute(arg)}, TMP_4.$$s = self, TMP_4.$$arity = 1, TMP_4));
        return (function(self, $visibility_scopes) {
          var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat(self), TMP_new_5;

          
          Opal.defn(self, '$new', TMP_new_5 = function($a_rest) {
            var self = this, args, instance = nil;

            var $args_len = arguments.length, $rest_len = $args_len - 0;
            if ($rest_len < 0) { $rest_len = 0; }
            args = new Array($rest_len);
            for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
              args[$arg_idx - 0] = arguments[$arg_idx];
            }
            
            instance = self.$allocate();
            instance.$$data = {};;
            $send(instance, 'initialize', Opal.to_a(args));
            return instance;
          }, TMP_new_5.$$arity = -1);
          return Opal.alias(self, "[]", "new");
        })(Opal.get_singleton_class(self), $scopes);}, TMP_3.$$s = self, TMP_3.$$arity = 0, TMP_3));
      if (block !== false && block !== nil && block != null) {
        $send(klass, 'module_eval', [], block.$to_proc())};
      if (const_name !== false && const_name !== nil && const_name != null) {
        Opal.const_get($scopes, 'Struct', true, true).$const_set(const_name, klass)};
      return klass;
    }, TMP_Struct_new_1.$$arity = -2);
    Opal.defs(self, '$define_struct_attribute', TMP_Struct_define_struct_attribute_8 = function $$define_struct_attribute(name) {
      var TMP_6, TMP_7, self = this;

      
      if (self['$=='](Opal.const_get($scopes, 'Struct', true, true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "you cannot define attributes to the Struct class")};
      self.$members()['$<<'](name);
      $send(self, 'define_method', [name], (TMP_6 = function(){var self = TMP_6.$$s || this;

      return self.$$data[name]}, TMP_6.$$s = self, TMP_6.$$arity = 0, TMP_6));
      return $send(self, 'define_method', ["" + (name) + "="], (TMP_7 = function(value){var self = TMP_7.$$s || this;
if (value == null) value = nil;
      return self.$$data[name] = value}, TMP_7.$$s = self, TMP_7.$$arity = 1, TMP_7));
    }, TMP_Struct_define_struct_attribute_8.$$arity = 1);
    Opal.defs(self, '$members', TMP_Struct_members_9 = function $$members() {
      var $a, self = this;
      if (self.members == null) self.members = nil;

      
      if (self['$=='](Opal.const_get($scopes, 'Struct', true, true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "the Struct class has no members")};
      return ((($a = self.members) !== false && $a !== nil && $a != null) ? $a : (self.members = []));
    }, TMP_Struct_members_9.$$arity = 0);
    Opal.defs(self, '$inherited', TMP_Struct_inherited_11 = function $$inherited(klass) {
      var TMP_10, self = this, members = nil;
      if (self.members == null) self.members = nil;

      
      members = self.members;
      return $send(klass, 'instance_eval', [], (TMP_10 = function(){var self = TMP_10.$$s || this;

      return (self.members = members)}, TMP_10.$$s = self, TMP_10.$$arity = 0, TMP_10));
    }, TMP_Struct_inherited_11.$$arity = 1);
    Opal.defn(self, '$initialize', TMP_Struct_initialize_13 = function $$initialize($a_rest) {
      var $b, TMP_12, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if ((($b = $rb_gt(args.$length(), self.$class().$members().$length())) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "struct size differs")};
      return $send(self.$class().$members(), 'each_with_index', [], (TMP_12 = function(name, index){var self = TMP_12.$$s || this, $writer = nil;
if (name == null) name = nil;if (index == null) index = nil;
      
        $writer = [name, args['$[]'](index)];
        $send(self, '[]=', Opal.to_a($writer));
        return $writer[$rb_minus($writer["length"], 1)];}, TMP_12.$$s = self, TMP_12.$$arity = 2, TMP_12));
    }, TMP_Struct_initialize_13.$$arity = -1);
    Opal.defn(self, '$members', TMP_Struct_members_14 = function $$members() {
      var self = this;

      return self.$class().$members()
    }, TMP_Struct_members_14.$$arity = 0);
    Opal.defn(self, '$hash', TMP_Struct_hash_15 = function $$hash() {
      var self = this;

      return Opal.const_get($scopes, 'Hash', true, true).$new(self.$$data).$hash()
    }, TMP_Struct_hash_15.$$arity = 0);
    Opal.defn(self, '$[]', TMP_Struct_$$_16 = function(name) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        if ((($a = $rb_lt(name, self.$class().$members().$size()['$-@']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + "offset " + (name) + " too small for struct(size:" + (self.$class().$members().$size()) + ")")};
        if ((($a = $rb_ge(name, self.$class().$members().$size())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + "offset " + (name) + " too large for struct(size:" + (self.$class().$members().$size()) + ")")};
        name = self.$class().$members()['$[]'](name);
      } else if ((($a = Opal.const_get($scopes, 'String', true, true)['$==='](name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        if(!self.$$data.hasOwnProperty(name)) {
          self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "no member '" + (name) + "' in struct", name))
        }
      
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "no implicit conversion of " + (name.$class()) + " into Integer")
      };
      name = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](name, Opal.const_get($scopes, 'String', true, true), "to_str");
      return self.$$data[name];
    }, TMP_Struct_$$_16.$$arity = 1);
    Opal.defn(self, '$[]=', TMP_Struct_$$$eq_17 = function(name, value) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Integer', true, true)['$==='](name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        
        if ((($a = $rb_lt(name, self.$class().$members().$size()['$-@']())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + "offset " + (name) + " too small for struct(size:" + (self.$class().$members().$size()) + ")")};
        if ((($a = $rb_ge(name, self.$class().$members().$size())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          self.$raise(Opal.const_get($scopes, 'IndexError', true, true), "" + "offset " + (name) + " too large for struct(size:" + (self.$class().$members().$size()) + ")")};
        name = self.$class().$members()['$[]'](name);
      } else if ((($a = Opal.const_get($scopes, 'String', true, true)['$==='](name)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        if ((($a = self.$class().$members()['$include?'](name.$to_sym())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          } else {
          self.$raise(Opal.const_get($scopes, 'NameError', true, true).$new("" + "no member '" + (name) + "' in struct", name))
        }
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "no implicit conversion of " + (name.$class()) + " into Integer")
      };
      name = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](name, Opal.const_get($scopes, 'String', true, true), "to_str");
      return self.$$data[name] = value;
    }, TMP_Struct_$$$eq_17.$$arity = 2);
    Opal.defn(self, '$==', TMP_Struct_$eq$eq_18 = function(other) {
      var $a, self = this;

      
      if ((($a = other['$instance_of?'](self.$class())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      
      var recursed1 = {}, recursed2 = {};

      function _eqeq(struct, other) {
        var key, a, b;

        recursed1[(struct).$__id__()] = true;
        recursed2[(other).$__id__()] = true;

        for (key in struct.$$data) {
          a = struct.$$data[key];
          b = other.$$data[key];

          if (Opal.const_get($scopes, 'Struct', true, true)['$==='](a)) {
            if (!recursed1.hasOwnProperty((a).$__id__()) || !recursed2.hasOwnProperty((b).$__id__())) {
              if (!_eqeq(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$=='](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eqeq(self, other);
    ;
    }, TMP_Struct_$eq$eq_18.$$arity = 1);
    Opal.defn(self, '$eql?', TMP_Struct_eql$q_19 = function(other) {
      var $a, self = this;

      
      if ((($a = other['$instance_of?'](self.$class())) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      
      var recursed1 = {}, recursed2 = {};

      function _eqeq(struct, other) {
        var key, a, b;

        recursed1[(struct).$__id__()] = true;
        recursed2[(other).$__id__()] = true;

        for (key in struct.$$data) {
          a = struct.$$data[key];
          b = other.$$data[key];

          if (Opal.const_get($scopes, 'Struct', true, true)['$==='](a)) {
            if (!recursed1.hasOwnProperty((a).$__id__()) || !recursed2.hasOwnProperty((b).$__id__())) {
              if (!_eqeq(a, b)) {
                return false;
              }
            }
          } else {
            if (!(a)['$eql?'](b)) {
              return false;
            }
          }
        }

        return true;
      }

      return _eqeq(self, other);
    ;
    }, TMP_Struct_eql$q_19.$$arity = 1);
    Opal.defn(self, '$each', TMP_Struct_each_20 = function $$each() {
      var TMP_21, TMP_22, self = this, $iter = TMP_Struct_each_20.$$p, $yield = $iter || nil;

      TMP_Struct_each_20.$$p = null;
      
      if (($yield !== nil)) {
        } else {
        return $send(self, 'enum_for', ["each"], (TMP_21 = function(){var self = TMP_21.$$s || this;

        return self.$size()}, TMP_21.$$s = self, TMP_21.$$arity = 0, TMP_21))
      };
      $send(self.$class().$members(), 'each', [], (TMP_22 = function(name){var self = TMP_22.$$s || this;
if (name == null) name = nil;
      return Opal.yield1($yield, self['$[]'](name));}, TMP_22.$$s = self, TMP_22.$$arity = 1, TMP_22));
      return self;
    }, TMP_Struct_each_20.$$arity = 0);
    Opal.defn(self, '$each_pair', TMP_Struct_each_pair_23 = function $$each_pair() {
      var TMP_24, TMP_25, self = this, $iter = TMP_Struct_each_pair_23.$$p, $yield = $iter || nil;

      TMP_Struct_each_pair_23.$$p = null;
      
      if (($yield !== nil)) {
        } else {
        return $send(self, 'enum_for', ["each_pair"], (TMP_24 = function(){var self = TMP_24.$$s || this;

        return self.$size()}, TMP_24.$$s = self, TMP_24.$$arity = 0, TMP_24))
      };
      $send(self.$class().$members(), 'each', [], (TMP_25 = function(name){var self = TMP_25.$$s || this;
if (name == null) name = nil;
      return Opal.yield1($yield, [name, self['$[]'](name)]);}, TMP_25.$$s = self, TMP_25.$$arity = 1, TMP_25));
      return self;
    }, TMP_Struct_each_pair_23.$$arity = 0);
    Opal.defn(self, '$length', TMP_Struct_length_26 = function $$length() {
      var self = this;

      return self.$class().$members().$length()
    }, TMP_Struct_length_26.$$arity = 0);
    Opal.alias(self, "size", "length");
    Opal.defn(self, '$to_a', TMP_Struct_to_a_28 = function $$to_a() {
      var TMP_27, self = this;

      return $send(self.$class().$members(), 'map', [], (TMP_27 = function(name){var self = TMP_27.$$s || this;
if (name == null) name = nil;
      return self['$[]'](name)}, TMP_27.$$s = self, TMP_27.$$arity = 1, TMP_27))
    }, TMP_Struct_to_a_28.$$arity = 0);
    Opal.alias(self, "values", "to_a");
    Opal.defn(self, '$inspect', TMP_Struct_inspect_30 = function $$inspect() {
      var $a, $b, TMP_29, self = this, result = nil;

      
      result = "#<struct ";
      if ((($a = ($b = Opal.const_get($scopes, 'Struct', true, true)['$==='](self), $b !== false && $b !== nil && $b != null ?self.$class().$name() : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        (result = $rb_plus(result, "" + (self.$class()) + " "))};
      (result = $rb_plus(result, $send(self.$each_pair(), 'map', [], (TMP_29 = function(name, value){var self = TMP_29.$$s || this;
if (name == null) name = nil;if (value == null) value = nil;
      return "" + (name) + "=" + (value.$inspect())}, TMP_29.$$s = self, TMP_29.$$arity = 2, TMP_29)).$join(", ")));
      (result = $rb_plus(result, ">"));
      return result;
    }, TMP_Struct_inspect_30.$$arity = 0);
    Opal.alias(self, "to_s", "inspect");
    Opal.defn(self, '$to_h', TMP_Struct_to_h_32 = function $$to_h() {
      var TMP_31, self = this;

      return $send(self.$class().$members(), 'inject', [$hash2([], {})], (TMP_31 = function(h, name){var self = TMP_31.$$s || this, $writer = nil;
if (h == null) h = nil;if (name == null) name = nil;
      
        
        $writer = [name, self['$[]'](name)];
        $send(h, '[]=', Opal.to_a($writer));
        $writer[$rb_minus($writer["length"], 1)];;
        return h;}, TMP_31.$$s = self, TMP_31.$$arity = 2, TMP_31))
    }, TMP_Struct_to_h_32.$$arity = 0);
    Opal.defn(self, '$values_at', TMP_Struct_values_at_34 = function $$values_at($a_rest) {
      var TMP_33, self = this, args;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      args = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        args[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      args = $send(args, 'map', [], (TMP_33 = function(arg){var self = TMP_33.$$s || this;
if (arg == null) arg = nil;
      return arg.$$is_range ? arg.$to_a() : arg}, TMP_33.$$s = self, TMP_33.$$arity = 1, TMP_33)).$flatten();
      
      var result = [];
      for (var i = 0, len = args.length; i < len; i++) {
        if (!args[i].$$is_number) {
          self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + "no implicit conversion of " + ((args[i]).$class()) + " into Integer")
        }
        result.push(self['$[]'](args[i]));
      }
      return result;
    ;
    }, TMP_Struct_values_at_34.$$arity = -1);
    Opal.defn(self, '$dig', TMP_Struct_dig_35 = function $$dig(key, $a_rest) {
      var $b, self = this, keys, item = nil;

      var $args_len = arguments.length, $rest_len = $args_len - 1;
      if ($rest_len < 0) { $rest_len = 0; }
      keys = new Array($rest_len);
      for (var $arg_idx = 1; $arg_idx < $args_len; $arg_idx++) {
        keys[$arg_idx - 1] = arguments[$arg_idx];
      }
      
      if ((($b = key.$$is_string && self.$$data.hasOwnProperty(key)) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        item = self.$$data[key] || nil
        } else {
        item = nil
      };
      
      if (item === nil || keys.length === 0) {
        return item;
      }
    ;
      if ((($b = item['$respond_to?']("dig")) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
        } else {
        self.$raise(Opal.const_get($scopes, 'TypeError', true, true), "" + (item.$class()) + " does not have #dig method")
      };
      return $send(item, 'dig', Opal.to_a(keys));
    }, TMP_Struct_dig_35.$$arity = -2);
    return Opal.defs(self, '$_load', TMP_Struct__load_36 = function $$_load(args) {
      var self = this, attributes = nil;

      
      attributes = $send(args, 'values_at', Opal.to_a(self.$members()));
      return $send(self, 'new', Opal.to_a(attributes));
    }, TMP_Struct__load_36.$$arity = 1);
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/io"] = function(Opal) {
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module, $send = Opal.send, $gvars = Opal.gvars, $writer = nil;

  Opal.add_stubs(['$attr_accessor', '$size', '$write', '$join', '$map', '$String', '$empty?', '$concat', '$chomp', '$getbyte', '$getc', '$raise', '$new', '$write_proc=', '$-', '$extend']);
  
  (function($base, $super, $visibility_scopes) {
    function $IO(){};
    var self = $IO = $klass($base, $super, 'IO', $IO);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_IO_tty$q_1, TMP_IO_closed$q_2, TMP_IO_write_3, TMP_IO_flush_4;

    def.tty = def.closed = nil;
    
    Opal.cdecl($scope, 'SEEK_SET', 0);
    Opal.cdecl($scope, 'SEEK_CUR', 1);
    Opal.cdecl($scope, 'SEEK_END', 2);
    Opal.defn(self, '$tty?', TMP_IO_tty$q_1 = function() {
      var self = this;

      return self.tty
    }, TMP_IO_tty$q_1.$$arity = 0);
    Opal.defn(self, '$closed?', TMP_IO_closed$q_2 = function() {
      var self = this;

      return self.closed
    }, TMP_IO_closed$q_2.$$arity = 0);
    self.$attr_accessor("write_proc");
    Opal.defn(self, '$write', TMP_IO_write_3 = function $$write(string) {
      var self = this;

      
      self.write_proc(string);
      return string.$size();
    }, TMP_IO_write_3.$$arity = 1);
    self.$attr_accessor("sync", "tty");
    Opal.defn(self, '$flush', TMP_IO_flush_4 = function $$flush() {
      var self = this;

      return nil
    }, TMP_IO_flush_4.$$arity = 0);
    (function($base, $visibility_scopes) {
      var $Writable, self = $Writable = $module($base, 'Writable');

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Writable_$lt$lt_5, TMP_Writable_print_7, TMP_Writable_puts_9;

      
      Opal.defn(self, '$<<', TMP_Writable_$lt$lt_5 = function(string) {
        var self = this;

        
        self.$write(string);
        return self;
      }, TMP_Writable_$lt$lt_5.$$arity = 1);
      Opal.defn(self, '$print', TMP_Writable_print_7 = function $$print($a_rest) {
        var TMP_6, self = this, args;
        if ($gvars[","] == null) $gvars[","] = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
        
        self.$write($send(args, 'map', [], (TMP_6 = function(arg){var self = TMP_6.$$s || this;
if (arg == null) arg = nil;
        return self.$String(arg)}, TMP_6.$$s = self, TMP_6.$$arity = 1, TMP_6)).$join($gvars[","]));
        return nil;
      }, TMP_Writable_print_7.$$arity = -1);
      Opal.defn(self, '$puts', TMP_Writable_puts_9 = function $$puts($a_rest) {
        var $b, TMP_8, self = this, args, newline = nil;
        if ($gvars["/"] == null) $gvars["/"] = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        args = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          args[$arg_idx - 0] = arguments[$arg_idx];
        }
        
        newline = $gvars["/"];
        if ((($b = args['$empty?']()) !== nil && $b != null && (!$b.$$is_boolean || $b == true))) {
          self.$write($gvars["/"])
          } else {
          self.$write($send(args, 'map', [], (TMP_8 = function(arg){var self = TMP_8.$$s || this;
if (arg == null) arg = nil;
          return self.$String(arg).$chomp()}, TMP_8.$$s = self, TMP_8.$$arity = 1, TMP_8)).$concat([nil]).$join(newline))
        };
        return nil;
      }, TMP_Writable_puts_9.$$arity = -1);
    })($scope.base, $scopes);
    return (function($base, $visibility_scopes) {
      var $Readable, self = $Readable = $module($base, 'Readable');

      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Readable_readbyte_10, TMP_Readable_readchar_11, TMP_Readable_readline_12, TMP_Readable_readpartial_13;

      
      Opal.defn(self, '$readbyte', TMP_Readable_readbyte_10 = function $$readbyte() {
        var self = this;

        return self.$getbyte()
      }, TMP_Readable_readbyte_10.$$arity = 0);
      Opal.defn(self, '$readchar', TMP_Readable_readchar_11 = function $$readchar() {
        var self = this;

        return self.$getc()
      }, TMP_Readable_readchar_11.$$arity = 0);
      Opal.defn(self, '$readline', TMP_Readable_readline_12 = function $$readline(sep) {
        var self = this;
        if ($gvars["/"] == null) $gvars["/"] = nil;

        if (sep == null) {
          sep = $gvars["/"];
        }
        return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true))
      }, TMP_Readable_readline_12.$$arity = -1);
      Opal.defn(self, '$readpartial', TMP_Readable_readpartial_13 = function $$readpartial(integer, outbuf) {
        var self = this;

        if (outbuf == null) {
          outbuf = nil;
        }
        return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true))
      }, TMP_Readable_readpartial_13.$$arity = -2);
    })($scope.base, $scopes);
  })($scope.base, null, $scopes);
  Opal.cdecl($scope, 'STDERR', ($gvars.stderr = Opal.const_get($scopes, 'IO', true, true).$new()));
  Opal.cdecl($scope, 'STDIN', ($gvars.stdin = Opal.const_get($scopes, 'IO', true, true).$new()));
  Opal.cdecl($scope, 'STDOUT', ($gvars.stdout = Opal.const_get($scopes, 'IO', true, true).$new()));
  var console = Opal.global.console;
  
  $writer = [typeof(process) === 'object' ? function(s){process.stdout.write(s)} : function(s){console.log(s)}];
  $send(Opal.const_get($scopes, 'STDOUT', true, true), 'write_proc=', Opal.to_a($writer));
  $writer[$rb_minus($writer["length"], 1)];;
  
  $writer = [typeof(process) === 'object' ? function(s){process.stderr.write(s)} : function(s){console.warn(s)}];
  $send(Opal.const_get($scopes, 'STDERR', true, true), 'write_proc=', Opal.to_a($writer));
  $writer[$rb_minus($writer["length"], 1)];;
  Opal.const_get($scopes, 'STDOUT', true, true).$extend(Opal.const_get([Opal.const_get($scopes, 'IO', true, true).$$scope], 'Writable', true, true));
  return Opal.const_get($scopes, 'STDERR', true, true).$extend(Opal.const_get([Opal.const_get($scopes, 'IO', true, true).$$scope], 'Writable', true, true));
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/main"] = function(Opal) {
  var TMP_to_s_1, TMP_include_2, self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$include']);
  
  Opal.defs(self, '$to_s', TMP_to_s_1 = function $$to_s() {
    var self = this;

    return "main"
  }, TMP_to_s_1.$$arity = 0);
  return Opal.defs(self, '$include', TMP_include_2 = function $$include(mod) {
    var self = this;

    return Opal.const_get($scopes, 'Object', true, true).$include(mod)
  }, TMP_include_2.$$arity = 1);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/dir"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$[]']);
  return (function($base, $super, $visibility_scopes) {
    function $Dir(){};
    var self = $Dir = $klass($base, $super, 'Dir', $Dir);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    return (function(self, $visibility_scopes) {
      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat(self), TMP_chdir_1, TMP_pwd_2, TMP_home_3;

      
      Opal.defn(self, '$chdir', TMP_chdir_1 = function $$chdir(dir) {
        var self = this, $iter = TMP_chdir_1.$$p, $yield = $iter || nil, prev_cwd = nil;

        TMP_chdir_1.$$p = null;
        return (function() { try {
        
        prev_cwd = Opal.current_dir;
        Opal.current_dir = dir;
        return Opal.yieldX($yield, []);;
        } finally {
          Opal.current_dir = prev_cwd
        }; })()
      }, TMP_chdir_1.$$arity = 1);
      Opal.defn(self, '$pwd', TMP_pwd_2 = function $$pwd() {
        var self = this;

        return Opal.current_dir || '.'
      }, TMP_pwd_2.$$arity = 0);
      Opal.alias(self, "getwd", "pwd");
      return (Opal.defn(self, '$home', TMP_home_3 = function $$home() {
        var $a, self = this;

        return ((($a = Opal.const_get($scopes, 'ENV', true, true)['$[]']("HOME")) !== false && $a !== nil && $a != null) ? $a : ".")
      }, TMP_home_3.$$arity = 0), nil) && 'home';
    })(Opal.get_singleton_class(self), $scopes)
  })($scope.base, null, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/file"] = function(Opal) {
  function $rb_minus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs - rhs : lhs['$-'](rhs);
  }
  function $rb_plus(lhs, rhs) {
    return (typeof(lhs) === 'number' && typeof(rhs) === 'number') ? lhs + rhs : lhs['$+'](rhs);
  }
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send, $range = Opal.range;

  Opal.add_stubs(['$join', '$compact', '$split', '$==', '$first', '$home', '$[]=', '$-', '$pwd', '$each', '$pop', '$<<', '$respond_to?', '$coerce_to!', '$+', '$basename', '$empty?', '$rindex', '$[]', '$nil?', '$length', '$gsub', '$find', '$=~', '$map', '$each_with_index', '$flatten', '$reject', '$end_with?', '$start_with?', '$sub']);
  return (function($base, $super, $visibility_scopes) {
    function $File(){};
    var self = $File = $klass($base, $super, 'File', $File);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    
    Opal.cdecl($scope, 'Separator', Opal.cdecl($scope, 'SEPARATOR', "/"));
    Opal.cdecl($scope, 'ALT_SEPARATOR', nil);
    Opal.cdecl($scope, 'PATH_SEPARATOR', ":");
    Opal.cdecl($scope, 'FNM_SYSCASE', 0);
    return (function(self, $visibility_scopes) {
      var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat(self), TMP_expand_path_2, $a, TMP_dirname_3, TMP_basename_4, TMP_extname_5, TMP_exist$q_6, TMP_directory$q_8, TMP_join_12, TMP_split_13;

      
      Opal.defn(self, '$expand_path', TMP_expand_path_2 = function $$expand_path(path, basedir) {
        var TMP_1, self = this, parts = nil, new_parts = nil, $writer = nil;

        if (basedir == null) {
          basedir = nil;
        }
        
        path = [basedir, path].$compact().$join(Opal.const_get($scopes, 'SEPARATOR', true, true));
        parts = path.$split(Opal.const_get($scopes, 'SEPARATOR', true, true));
        new_parts = [];
        if (parts.$first()['$==']("~")) {
          
          $writer = [0, Opal.const_get($scopes, 'Dir', true, true).$home()];
          $send(parts, '[]=', Opal.to_a($writer));
          $writer[$rb_minus($writer["length"], 1)];};
        if (parts.$first()['$=='](".")) {
          
          $writer = [0, Opal.const_get($scopes, 'Dir', true, true).$pwd()];
          $send(parts, '[]=', Opal.to_a($writer));
          $writer[$rb_minus($writer["length"], 1)];};
        $send(parts, 'each', [], (TMP_1 = function(part){var self = TMP_1.$$s || this;
if (part == null) part = nil;
        if (part['$==']("..")) {
            return new_parts.$pop()
            } else {
            return new_parts['$<<'](part)
          }}, TMP_1.$$s = self, TMP_1.$$arity = 1, TMP_1));
        return new_parts.$join(Opal.const_get($scopes, 'SEPARATOR', true, true));
      }, TMP_expand_path_2.$$arity = -2);
      Opal.alias(self, "realpath", "expand_path");
      
      // Coerce a given path to a path string using #to_path and #to_str
      function $coerce_to_path(path) {
        if ((($a = (path)['$respond_to?']("to_path")) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          path = path.$to_path();
        }

        path = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](path, Opal.const_get($scopes, 'String', true, true), "to_str");

        return path;
      }

      // Return a RegExp compatible char class
      function $sep_chars() {
        if (Opal.const_get($scopes, 'ALT_SEPARATOR', true, true) === nil) {
          return Opal.escape_regexp(Opal.const_get($scopes, 'SEPARATOR', true, true));
        } else {
          return Opal.escape_regexp($rb_plus(Opal.const_get($scopes, 'SEPARATOR', true, true), Opal.const_get($scopes, 'ALT_SEPARATOR', true, true)));
        }
      }
    ;
      Opal.defn(self, '$dirname', TMP_dirname_3 = function $$dirname(path) {
        var self = this, sep_chars = nil;

        
        sep_chars = $sep_chars();
        path = $coerce_to_path(path);
        
        var absolute = path.match(new RegExp("" + "^[" + (sep_chars) + "]"));

        path = path.replace(new RegExp("" + "[" + (sep_chars) + "]+$"), ''); // remove trailing separators
        path = path.replace(new RegExp("" + "[^" + (sep_chars) + "]+$"), ''); // remove trailing basename
        path = path.replace(new RegExp("" + "[" + (sep_chars) + "]+$"), ''); // remove final trailing separators

        if (path === '') {
          return absolute ? '/' : '.';
        }

        return path;
      ;
      }, TMP_dirname_3.$$arity = 1);
      Opal.defn(self, '$basename', TMP_basename_4 = function $$basename(name, suffix) {
        var self = this, sep_chars = nil;

        if (suffix == null) {
          suffix = nil;
        }
        
        sep_chars = $sep_chars();
        name = $coerce_to_path(name);
        
        if (name.length == 0) {
          return name;
        }

        if (suffix !== nil) {
          suffix = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](suffix, Opal.const_get($scopes, 'String', true, true), "to_str")
        } else {
          suffix = null;
        }

        name = name.replace(new RegExp("" + "(.)[" + (sep_chars) + "]*$"), '$1');
        name = name.replace(new RegExp("" + "^(?:.*[" + (sep_chars) + "])?([^" + (sep_chars) + "]+)$"), '$1');

        if (suffix === ".*") {
          name = name.replace(/\.[^\.]+$/, '');
        } else if(suffix !== null) {
          suffix = Opal.escape_regexp(suffix);
          name = name.replace(new RegExp("" + (suffix) + "$"), '');
        }

        return name;
      ;
      }, TMP_basename_4.$$arity = -2);
      Opal.defn(self, '$extname', TMP_extname_5 = function $$extname(path) {
        var $a, $b, self = this, filename = nil, last_dot_idx = nil;

        
        path = $coerce_to_path(path);;
        filename = self.$basename(path);
        if ((($a = filename['$empty?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return ""};
        last_dot_idx = filename['$[]']($range(1, -1, false)).$rindex(".");
        if ((($a = ((($b = last_dot_idx['$nil?']()) !== false && $b !== nil && $b != null) ? $b : $rb_plus(last_dot_idx, 1)['$==']($rb_minus(filename.$length(), 1)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
          return ""
          } else {
          return filename['$[]'](Opal.Range.$new($rb_plus(last_dot_idx, 1), -1, false))
        };
      }, TMP_extname_5.$$arity = 1);
      Opal.defn(self, '$exist?', TMP_exist$q_6 = function(path) {
        var self = this;

        return Opal.modules[path] != null
      }, TMP_exist$q_6.$$arity = 1);
      Opal.alias(self, "exists?", "exist?");
      Opal.defn(self, '$directory?', TMP_directory$q_8 = function(path) {
        var TMP_7, self = this, files = nil, file = nil;

        
        files = [];
        
        for (var key in Opal.modules) {
          files.push(key)
        }
      ;
        path = path.$gsub(new RegExp("" + "(^." + (Opal.const_get($scopes, 'SEPARATOR', true, true)) + "+|" + (Opal.const_get($scopes, 'SEPARATOR', true, true)) + "+$)"));
        file = $send(files, 'find', [], (TMP_7 = function(file){var self = TMP_7.$$s || this;
if (file == null) file = nil;
        return file['$=~'](new RegExp("" + "^" + (path)))}, TMP_7.$$s = self, TMP_7.$$arity = 1, TMP_7));
        return file;
      }, TMP_directory$q_8.$$arity = 1);
      Opal.defn(self, '$join', TMP_join_12 = function $$join($a_rest) {
        var TMP_9, TMP_10, TMP_11, self = this, paths, result = nil;

        var $args_len = arguments.length, $rest_len = $args_len - 0;
        if ($rest_len < 0) { $rest_len = 0; }
        paths = new Array($rest_len);
        for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
          paths[$arg_idx - 0] = arguments[$arg_idx];
        }
        
        if (paths.$length()['$=='](0)) {
          return ""};
        result = "";
        paths = $send(paths.$flatten().$each_with_index(), 'map', [], (TMP_9 = function(item, index){var self = TMP_9.$$s || this, $a, $b;
if (item == null) item = nil;if (index == null) index = nil;
        if ((($a = (($b = index['$=='](0)) ? item['$empty?']() : index['$=='](0))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return Opal.const_get($scopes, 'SEPARATOR', true, true)
          } else if ((($a = (($b = paths.$length()['$==']($rb_plus(index, 1))) ? item['$empty?']() : paths.$length()['$==']($rb_plus(index, 1)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return Opal.const_get($scopes, 'SEPARATOR', true, true)
            } else {
            return item
          }}, TMP_9.$$s = self, TMP_9.$$arity = 2, TMP_9));
        paths = $send(paths, 'reject', [], (TMP_10 = function(path){var self = TMP_10.$$s || this;
if (path == null) path = nil;
        return path['$empty?']()}, TMP_10.$$s = self, TMP_10.$$arity = 1, TMP_10));
        $send(paths, 'each_with_index', [], (TMP_11 = function(item, index){var self = TMP_11.$$s || this, $a, $b, next_item = nil;
if (item == null) item = nil;if (index == null) index = nil;
        
          next_item = paths['$[]']($rb_plus(index, 1));
          if ((($a = next_item['$nil?']()) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
            return (result = "" + (result) + (item))
            } else {
            
            if ((($a = ($b = item['$end_with?'](Opal.const_get($scopes, 'SEPARATOR', true, true)), $b !== false && $b !== nil && $b != null ?next_item['$start_with?'](Opal.const_get($scopes, 'SEPARATOR', true, true)) : $b)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
              item = item.$sub(new RegExp("" + (Opal.const_get($scopes, 'SEPARATOR', true, true)) + "+$"), "")};
            if ((($a = ((($b = item['$end_with?'](Opal.const_get($scopes, 'SEPARATOR', true, true))) !== false && $b !== nil && $b != null) ? $b : next_item['$start_with?'](Opal.const_get($scopes, 'SEPARATOR', true, true)))) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
              return (result = "" + (result) + (item))
              } else {
              return (result = "" + (result) + (item) + (Opal.const_get($scopes, 'SEPARATOR', true, true)))
            };
          };}, TMP_11.$$s = self, TMP_11.$$arity = 2, TMP_11));
        return result;
      }, TMP_join_12.$$arity = -1);
      return (Opal.defn(self, '$split', TMP_split_13 = function $$split(path) {
        var self = this;

        return path.$split(Opal.const_get($scopes, 'SEPARATOR', true, true))
      }, TMP_split_13.$$arity = 1), nil) && 'split';
    })(Opal.get_singleton_class(self), $scopes);
  })($scope.base, Opal.const_get($scopes, 'IO', true, true), $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/process"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  Opal.add_stubs(['$to_f', '$now', '$new']);
  
  (function($base, $super, $visibility_scopes) {
    function $Process(){};
    var self = $Process = $klass($base, $super, 'Process', $Process);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Process_pid_1, TMP_Process_times_2, TMP_Process_clock_gettime_3;

    
    Opal.cdecl($scope, 'CLOCK_REALTIME', 0);
    Opal.cdecl($scope, 'CLOCK_MONOTONIC', 1);
    Opal.defs(self, '$pid', TMP_Process_pid_1 = function $$pid() {
      var self = this;

      return 0
    }, TMP_Process_pid_1.$$arity = 0);
    Opal.defs(self, '$times', TMP_Process_times_2 = function $$times() {
      var self = this, t = nil;

      
      t = Opal.const_get($scopes, 'Time', true, true).$now().$to_f();
      return Opal.const_get([Opal.const_get($scopes, 'Benchmark', true, true).$$scope], 'Tms', true, true).$new(t, t, t, t, t);
    }, TMP_Process_times_2.$$arity = 0);
    return Opal.defs(self, '$clock_gettime', TMP_Process_clock_gettime_3 = function $$clock_gettime(clock_id, unit) {
      var self = this;

      if (unit == null) {
        unit = nil;
      }
      return Opal.const_get($scopes, 'Time', true, true).$now().$to_f()
    }, TMP_Process_clock_gettime_3.$$arity = -2);
  })($scope.base, null, $scopes);
  (function($base, $super, $visibility_scopes) {
    function $Signal(){};
    var self = $Signal = $klass($base, $super, 'Signal', $Signal);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Signal_trap_4;

    return Opal.defs(self, '$trap', TMP_Signal_trap_4 = function $$trap($a_rest) {
      var self = this;

      return nil
    }, TMP_Signal_trap_4.$$arity = -1)
  })($scope.base, null, $scopes);
  return (function($base, $super, $visibility_scopes) {
    function $GC(){};
    var self = $GC = $klass($base, $super, 'GC', $GC);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_GC_start_5;

    return Opal.defs(self, '$start', TMP_GC_start_5 = function $$start() {
      var self = this;

      return nil
    }, TMP_GC_start_5.$$arity = 0)
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/random/seedrandom"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass;

  return (function($base, $super, $visibility_scopes) {
    function $Random(){};
    var self = $Random = $klass($base, $super, 'Random', $Random);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope);

    
    /* jshint ignore:start */
    /* seedrandom.min.js 2.4.1 https://github.com/davidbau/seedrandom + PR https://github.com/davidbau/seedrandom/pull/36 */
    !function(a,b){function c(c,j,k){var n=[];j=1==j?{entropy:!0}:j||{};var s=g(f(j.entropy?[c,i(a)]:null==c?h():c,3),n),t=new d(n),u=function(){for(var a=t.g(m),b=p,c=0;a<q;)a=(a+c)*l,b*=l,c=t.g(1);for(;a>=r;)a/=2,b/=2,c>>>=1;return(a+c)/b};return u.int32=function(){return 0|t.g(4)},u.quick=function(){return t.g(4)/4294967296},u.double=u,g(i(t.S),a),(j.pass||k||function(a,c,d,f){return f&&(f.S&&e(f,t),a.state=function(){return e(t,{})}),d?(b[o]=a,c):a})(u,s,"global"in j?j.global:this==b,j.state)}function d(a){var b,c=a.length,d=this,e=0,f=d.i=d.j=0,g=d.S=[];for(c||(a=[c++]);e<l;)g[e]=e++;for(e=0;e<l;e++)g[e]=g[f=s&f+a[e%c]+(b=g[e])],g[f]=b;(d.g=function(a){for(var b,c=0,e=d.i,f=d.j,g=d.S;a--;)b=g[e=s&e+1],c=c*l+g[s&(g[e]=g[f=s&f+b])+(g[f]=b)];return d.i=e,d.j=f,c})(l)}function e(a,b){return b.i=a.i,b.j=a.j,b.S=a.S.slice(),b}function f(a,b){var c,d=[],e=typeof a;if(b&&"object"==e)for(c in a)if(a.hasOwnProperty(c))try{d.push(f(a[c],b-1))}catch(a){}return d.length?d:"string"==e?a:a+"\0"}function g(a,b){for(var c,d=a+"",e=0;e<d.length;)b[s&e]=s&(c^=19*b[s&e])+d.charCodeAt(e++);return i(b)}function h(){try{if(j)return i(j.randomBytes(l));var b=new Uint8Array(l);return(k.crypto||k.msCrypto).getRandomValues(b),i(b)}catch(b){var c=k.navigator,d=c&&c.plugins;return[+new Date,k,d,k.screen,i(a)]}}function i(a){return String.fromCharCode.apply(0,a)}var j,k=this,l=256,m=6,n=52,o="random",p=b.pow(l,m),q=b.pow(2,n),r=2*q,s=l-1;if(b["seed"+o]=c,g(b.random(),a),"object"==typeof module&&module.exports){module.exports=c;try{j=require("crypto")}catch(a){}}else"function"==typeof define&&define.amd&&define(function(){return c})}([],Math);
    /* jshint ignore:end */
  
  })($scope.base, null, $scopes)
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/random"] = function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $send = Opal.send;

  Opal.add_stubs(['$require', '$attr_reader', '$coerce_to!', '$reseed', '$new_seed', '$rand', '$seed', '$new', '$===', '$==', '$state', '$encode', '$join', '$map', '$times', '$chr', '$raise']);
  
  self.$require("corelib/random/seedrandom.js");
  return (function($base, $super, $visibility_scopes) {
    function $Random(){};
    var self = $Random = $klass($base, $super, 'Random', $Random);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Random_initialize_1, TMP_Random_reseed_2, TMP_Random_new_seed_3, TMP_Random_rand_4, TMP_Random_srand_5, TMP_Random_$eq$eq_6, TMP_Random_bytes_8, TMP_Random_rand_9;

    
    self.$attr_reader("seed", "state");
    Opal.defn(self, '$initialize', TMP_Random_initialize_1 = function $$initialize(seed) {
      var self = this;

      if (seed == null) {
        seed = Opal.const_get($scopes, 'Random', true, true).$new_seed();
      }
      
      seed = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](seed, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      self.state = seed;
      return self.$reseed(seed);
    }, TMP_Random_initialize_1.$$arity = -1);
    Opal.defn(self, '$reseed', TMP_Random_reseed_2 = function $$reseed(seed) {
      var self = this;

      
      self.seed = seed;
      return self.$rng = new Math.seedrandom(seed);;
    }, TMP_Random_reseed_2.$$arity = 1);
    var $seed_generator = new Math.seedrandom('opal', { entropy: true });;
    Opal.defs(self, '$new_seed', TMP_Random_new_seed_3 = function $$new_seed() {
      var self = this;

      
      return Math.abs($seed_generator.int32());
    
    }, TMP_Random_new_seed_3.$$arity = 0);
    Opal.defs(self, '$rand', TMP_Random_rand_4 = function $$rand(limit) {
      var self = this;

      return Opal.const_get($scopes, 'DEFAULT', true, true).$rand(limit)
    }, TMP_Random_rand_4.$$arity = -1);
    Opal.defs(self, '$srand', TMP_Random_srand_5 = function $$srand(n) {
      var self = this, previous_seed = nil;

      if (n == null) {
        n = Opal.const_get($scopes, 'Random', true, true).$new_seed();
      }
      
      n = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](n, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      previous_seed = Opal.const_get($scopes, 'DEFAULT', true, true).$seed();
      Opal.const_get($scopes, 'DEFAULT', true, true).$reseed(n);
      return previous_seed;
    }, TMP_Random_srand_5.$$arity = -1);
    Opal.cdecl($scope, 'DEFAULT', self.$new(self.$new_seed()));
    Opal.defn(self, '$==', TMP_Random_$eq$eq_6 = function(other) {
      var $a, self = this;

      
      if ((($a = Opal.const_get($scopes, 'Random', true, true)['$==='](other)) !== nil && $a != null && (!$a.$$is_boolean || $a == true))) {
        } else {
        return false
      };
      return (($a = self.$seed()['$=='](other.$seed())) ? self.$state()['$=='](other.$state()) : self.$seed()['$=='](other.$seed()));
    }, TMP_Random_$eq$eq_6.$$arity = 1);
    Opal.defn(self, '$bytes', TMP_Random_bytes_8 = function $$bytes(length) {
      var TMP_7, self = this;

      
      length = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](length, Opal.const_get($scopes, 'Integer', true, true), "to_int");
      return $send(length.$times(), 'map', [], (TMP_7 = function(){var self = TMP_7.$$s || this;

      return self.$rand(255).$chr()}, TMP_7.$$s = self, TMP_7.$$arity = 0, TMP_7)).$join().$encode(Opal.const_get([Opal.const_get($scopes, 'Encoding', true, true).$$scope], 'ASCII_8BIT', true, true));
    }, TMP_Random_bytes_8.$$arity = 1);
    return (Opal.defn(self, '$rand', TMP_Random_rand_9 = function $$rand(limit) {
      var self = this;

      
      function randomFloat() {
        self.state++;
        return self.$rng.quick();
      }

      function randomInt() {
        return Math.floor(randomFloat() * limit);
      }

      function randomRange() {
        var min = limit.begin,
            max = limit.end;

        if (min === nil || max === nil) {
          return nil;
        }

        var length = max - min;

        if (length < 0) {
          return nil;
        }

        if (length === 0) {
          return min;
        }

        if (max % 1 === 0 && min % 1 === 0 && !limit.exclude) {
          length++;
        }

        return self.$rand(length) + min;
      }

      if (limit == null) {
        return randomFloat();
      } else if (limit.$$is_range) {
        return randomRange();
      } else if (limit.$$is_number) {
        if (limit <= 0) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid argument - " + (limit))
        }

        if (limit % 1 === 0) {
          // integer
          return randomInt();
        } else {
          return randomFloat() * limit;
        }
      } else {
        limit = Opal.const_get($scopes, 'Opal', true, true)['$coerce_to!'](limit, Opal.const_get($scopes, 'Integer', true, true), "to_int");

        if (limit <= 0) {
          self.$raise(Opal.const_get($scopes, 'ArgumentError', true, true), "" + "invalid argument - " + (limit))
        }

        return randomInt();
      }
    
    }, TMP_Random_rand_9.$$arity = -1), nil) && 'rand';
  })($scope.base, null, $scopes);
};

/* Generated by Opal 0.11.0.dev */
Opal.modules["corelib/unsupported"] = function(Opal) {
  var TMP_public_30, TMP_private_31, self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice, $klass = Opal.klass, $module = Opal.module;

  Opal.add_stubs(['$raise', '$warn', '$%']);
  
  
  var warnings = {};

  function handle_unsupported_feature(message) {
    switch (Opal.config.unsupported_features_severity) {
    case 'error':
      Opal.const_get($scopes, 'Kernel', true, true).$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), message)
      break;
    case 'warning':
      warn(message)
      break;
    default: // ignore
      // noop
    }
  }

  function warn(string) {
    if (warnings[string]) {
      return;
    }

    warnings[string] = true;
    self.$warn(string);
  }
;
  (function($base, $super, $visibility_scopes) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_String_$lt$lt_1, TMP_String_capitalize$B_2, TMP_String_chomp$B_3, TMP_String_chop$B_4, TMP_String_downcase$B_5, TMP_String_gsub$B_6, TMP_String_lstrip$B_7, TMP_String_next$B_8, TMP_String_reverse$B_9, TMP_String_slice$B_10, TMP_String_squeeze$B_11, TMP_String_strip$B_12, TMP_String_sub$B_13, TMP_String_succ$B_14, TMP_String_swapcase$B_15, TMP_String_tr$B_16, TMP_String_tr_s$B_17, TMP_String_upcase$B_18;

    
    var ERROR = "String#%s not supported. Mutable String methods are not supported in Opal.";;
    Opal.defn(self, '$<<', TMP_String_$lt$lt_1 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("<<"))
    }, TMP_String_$lt$lt_1.$$arity = -1);
    Opal.defn(self, '$capitalize!', TMP_String_capitalize$B_2 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("capitalize!"))
    }, TMP_String_capitalize$B_2.$$arity = -1);
    Opal.defn(self, '$chomp!', TMP_String_chomp$B_3 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("chomp!"))
    }, TMP_String_chomp$B_3.$$arity = -1);
    Opal.defn(self, '$chop!', TMP_String_chop$B_4 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("chop!"))
    }, TMP_String_chop$B_4.$$arity = -1);
    Opal.defn(self, '$downcase!', TMP_String_downcase$B_5 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("downcase!"))
    }, TMP_String_downcase$B_5.$$arity = -1);
    Opal.defn(self, '$gsub!', TMP_String_gsub$B_6 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("gsub!"))
    }, TMP_String_gsub$B_6.$$arity = -1);
    Opal.defn(self, '$lstrip!', TMP_String_lstrip$B_7 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("lstrip!"))
    }, TMP_String_lstrip$B_7.$$arity = -1);
    Opal.defn(self, '$next!', TMP_String_next$B_8 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("next!"))
    }, TMP_String_next$B_8.$$arity = -1);
    Opal.defn(self, '$reverse!', TMP_String_reverse$B_9 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("reverse!"))
    }, TMP_String_reverse$B_9.$$arity = -1);
    Opal.defn(self, '$slice!', TMP_String_slice$B_10 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("slice!"))
    }, TMP_String_slice$B_10.$$arity = -1);
    Opal.defn(self, '$squeeze!', TMP_String_squeeze$B_11 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("squeeze!"))
    }, TMP_String_squeeze$B_11.$$arity = -1);
    Opal.defn(self, '$strip!', TMP_String_strip$B_12 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("strip!"))
    }, TMP_String_strip$B_12.$$arity = -1);
    Opal.defn(self, '$sub!', TMP_String_sub$B_13 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("sub!"))
    }, TMP_String_sub$B_13.$$arity = -1);
    Opal.defn(self, '$succ!', TMP_String_succ$B_14 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("succ!"))
    }, TMP_String_succ$B_14.$$arity = -1);
    Opal.defn(self, '$swapcase!', TMP_String_swapcase$B_15 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("swapcase!"))
    }, TMP_String_swapcase$B_15.$$arity = -1);
    Opal.defn(self, '$tr!', TMP_String_tr$B_16 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("tr!"))
    }, TMP_String_tr$B_16.$$arity = -1);
    Opal.defn(self, '$tr_s!', TMP_String_tr_s$B_17 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("tr_s!"))
    }, TMP_String_tr_s$B_17.$$arity = -1);
    return (Opal.defn(self, '$upcase!', TMP_String_upcase$B_18 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), (ERROR)['$%']("upcase!"))
    }, TMP_String_upcase$B_18.$$arity = -1), nil) && 'upcase!';
  })($scope.base, null, $scopes);
  (function($base, $visibility_scopes) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Kernel_freeze_19, TMP_Kernel_frozen$q_20;

    
    var ERROR = "Object freezing is not supported by Opal";;
    Opal.defn(self, '$freeze', TMP_Kernel_freeze_19 = function $$freeze() {
      var self = this;

      
      handle_unsupported_feature(ERROR);
      return self;
    }, TMP_Kernel_freeze_19.$$arity = 0);
    Opal.defn(self, '$frozen?', TMP_Kernel_frozen$q_20 = function() {
      var self = this;

      
      handle_unsupported_feature(ERROR);
      return false;
    }, TMP_Kernel_frozen$q_20.$$arity = 0);
  })($scope.base, $scopes);
  (function($base, $visibility_scopes) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Kernel_taint_21, TMP_Kernel_untaint_22, TMP_Kernel_tainted$q_23;

    
    var ERROR = "Object tainting is not supported by Opal";;
    Opal.defn(self, '$taint', TMP_Kernel_taint_21 = function $$taint() {
      var self = this;

      
      handle_unsupported_feature(ERROR);
      return self;
    }, TMP_Kernel_taint_21.$$arity = 0);
    Opal.defn(self, '$untaint', TMP_Kernel_untaint_22 = function $$untaint() {
      var self = this;

      
      handle_unsupported_feature(ERROR);
      return self;
    }, TMP_Kernel_untaint_22.$$arity = 0);
    Opal.defn(self, '$tainted?', TMP_Kernel_tainted$q_23 = function() {
      var self = this;

      
      handle_unsupported_feature(ERROR);
      return false;
    }, TMP_Kernel_tainted$q_23.$$arity = 0);
  })($scope.base, $scopes);
  (function($base, $super, $visibility_scopes) {
    function $Module(){};
    var self = $Module = $klass($base, $super, 'Module', $Module);

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Module_public_24, TMP_Module_private_class_method_25, TMP_Module_private_method_defined$q_26, TMP_Module_private_constant_27;

    
    Opal.defn(self, '$public', TMP_Module_public_24 = function($a_rest) {
      var self = this, methods;

      var $args_len = arguments.length, $rest_len = $args_len - 0;
      if ($rest_len < 0) { $rest_len = 0; }
      methods = new Array($rest_len);
      for (var $arg_idx = 0; $arg_idx < $args_len; $arg_idx++) {
        methods[$arg_idx - 0] = arguments[$arg_idx];
      }
      
      if (methods.length === 0) {
        self.$$module_function = false;
      }

      return nil;
    
    }, TMP_Module_public_24.$$arity = -1);
    Opal.alias(self, "private", "public");
    Opal.alias(self, "protected", "public");
    Opal.alias(self, "nesting", "public");
    Opal.defn(self, '$private_class_method', TMP_Module_private_class_method_25 = function $$private_class_method($a_rest) {
      var self = this;

      return self
    }, TMP_Module_private_class_method_25.$$arity = -1);
    Opal.alias(self, "public_class_method", "private_class_method");
    Opal.defn(self, '$private_method_defined?', TMP_Module_private_method_defined$q_26 = function(obj) {
      var self = this;

      return false
    }, TMP_Module_private_method_defined$q_26.$$arity = 1);
    Opal.defn(self, '$private_constant', TMP_Module_private_constant_27 = function $$private_constant($a_rest) {
      var self = this;

      return nil
    }, TMP_Module_private_constant_27.$$arity = -1);
    Opal.alias(self, "protected_method_defined?", "private_method_defined?");
    Opal.alias(self, "public_instance_methods", "instance_methods");
    return Opal.alias(self, "public_method_defined?", "method_defined?");
  })($scope.base, null, $scopes);
  (function($base, $visibility_scopes) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Kernel_private_methods_28;

    
    Opal.defn(self, '$private_methods', TMP_Kernel_private_methods_28 = function $$private_methods($a_rest) {
      var self = this;

      return []
    }, TMP_Kernel_private_methods_28.$$arity = -1);
    Opal.alias(self, "private_instance_methods", "private_methods");
  })($scope.base, $scopes);
  (function($base, $visibility_scopes) {
    var $Kernel, self = $Kernel = $module($base, 'Kernel');

    var def = self.$$proto, $scope = self.$$scope, $scopes = $visibility_scopes.slice().concat($scope), TMP_Kernel_eval_29;

    Opal.defn(self, '$eval', TMP_Kernel_eval_29 = function($a_rest) {
      var self = this;

      return self.$raise(Opal.const_get($scopes, 'NotImplementedError', true, true), "" + "To use Kernel#eval, you must first require 'opal-parser'. " + ("" + "See https://github.com/opal/opal/blob/" + (Opal.const_get($scopes, 'RUBY_ENGINE_VERSION', true, true)) + "/docs/opal_parser.md for details."))
    }, TMP_Kernel_eval_29.$$arity = -1)
  })($scope.base, $scopes);
  Opal.defs(self, '$public', TMP_public_30 = function($a_rest) {
    var self = this;

    return nil
  }, TMP_public_30.$$arity = -1);
  return Opal.defs(self, '$private', TMP_private_31 = function($a_rest) {
    var self = this;

    return nil
  }, TMP_private_31.$$arity = -1);
};

/* Generated by Opal 0.11.0.dev */
(function(Opal) {
  var self = Opal.top, $scope = Opal, $scopes = [Opal], nil = Opal.nil, $breaker = Opal.breaker, $slice = Opal.slice;

  Opal.add_stubs(['$require']);
  
  self.$require("opal/base");
  self.$require("opal/mini");
  self.$require("corelib/string/inheritance");
  self.$require("corelib/string/encoding");
  self.$require("corelib/math");
  self.$require("corelib/complex");
  self.$require("corelib/rational");
  self.$require("corelib/time");
  self.$require("corelib/struct");
  self.$require("corelib/io");
  self.$require("corelib/main");
  self.$require("corelib/dir");
  self.$require("corelib/file");
  self.$require("corelib/process");
  self.$require("corelib/random");
  return self.$require("corelib/unsupported");
})(Opal);
