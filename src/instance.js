    /*****************
        Constants
    *****************/

    var NAME = "velocity";

    /******************************
       Utility Function & State
    ******************************/

    /* In addition to extending jQuery's $.fn object, Velocity also registers itself as a jQuery utility ($.) function so that certain features are accessible beyond just a per-element scope. */
    /* Note: The utility function doubles as a publicly-accessible data store for the purposes of unit testing. */
    var velocity = {
        /* Container for page-wide Velocity state data. */
        State: {
            /* Detect mobile devices to determine if mobileHA should be turned on. */
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            /* Create a cached element for re-use when checking for CSS property prefixes. */
            prefixElement: document.createElement("div"),
            /* Cache every prefix match to avoid repeating lookups. */
            prefixMatches: {},
            /* Cache the anchor used for animating window scrolling. */
            scrollAnchor: null,
            /* Cache the property name associated with the scroll anchor. */
            scrollProperty: null,
            /* Keep track of whether our RAF tick is running. */
            isTicking: false,
            /* Container for every in-progress call to Velocity. */
            calls: []
        },
        Classes: {
            /* Container for CSS classes extracted from the page's stylesheets. */
            extracted: {},
            /* Function to allow users to force stylesheet re-extraction. */
            extract: function() { /* Defined below. */ }
        },
        /* Velocity's full re-implementation of jQuery's CSS stack. Made global for unit testing. */
        CSS: { /* Defined below. */ },
        /* Container for custom animation sequences that are referenced by name via Velocity's first argument (instead of passing in a properties map). */
        Sequences: {
            /* Manually extended by the user. */
        },
        /* Utility function's alias of $.fn.velocity(). Used for raw DOM element animation. */
        animate: function () { /* Defined below. */ },
        /* Set to 1 or 2 (most verbose) to log debug info to console. */
        debug: false
    };

    /* Even if referred as $ internally, we export the set of utilities generated above, mostly for testing purposes, as it is the only way to access the data store. */
    if(!$.fn.jquery) {
        velocity.Utilities = $;
    }

    /* Retrieve the appropriate scroll anchor and property name for this browser. Learn more: https://developer.mozilla.org/en-US/docs/Web/API/Window.scrollY */
    if (window.pageYOffset !== undefined) {
        velocity.State.scrollAnchor = window;
        velocity.State.scrollProperty = "pageYOffset";
    } else {
        velocity.State.scrollAnchor = document.documentElement || document.body.parentNode || document.body;
        velocity.State.scrollProperty = "scrollTop";
    }