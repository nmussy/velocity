velocity.Sequences.slideUp = function(element, options) {
    var originalValues = {
            height: null,
            marginTop: null,
            marginBottom: null,
            paddingTop: null,
            paddingBottom: null,
            overflow: null,
            overflowY: null
        };

    var complete = options.complete;

    options.display = options.display || "none";
    options._cacheValues = false;

    options.begin = function() {
        for (var property in originalValues) {
            originalValues[property] = velocity.CSS.getPropertyValue(element, property);
        }

        this.style.overflow = "hidden";
        this.style.overflowY = "hidden";
    };

    options.complete = function() {
        if (complete) {
            complete.call(this, this);
        }
        
        for (var property in originalValues) {
            this.style[property] = originalValues[property];
        }
    };

    velocity.animate(element, { 
        height: [ 0, originalValues.height ],
        marginTop: [ 0, originalValues.marginTop ],
        marginBottom: [ 0, originalValues.marginBottom ],
        paddingTop: [ 0, originalValues.paddingTop ],
        paddingBottom: [ 0, originalValues.paddingBottom ]
    }, options);
};