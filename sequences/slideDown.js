velocity.Sequences.slideDown = function(element, options) {
    var originalValues = {
            height: null,
            marginTop: null,
            marginBottom: null,
            paddingTop: null,
            paddingBottom: null
        },
        originalOverflows = {
            overflow: null,
            overflowY: null
        };

    var complete = options.complete;

    options.delay = options.delay || 1;

    options.begin = function() {
        originalOverflows.overflow = velocity.CSS.getPropertyValue(element, "overflow");
        originalOverflows.overflowY = velocity.CSS.getPropertyValue(element, "overflowY");

        this.style.overflow = "hidden";
        this.style.overflowY = "hidden";

        element.style.height = "auto";
        element.style.display = "block";

        for (var property in originalValues) {
            originalValues[property] = [ velocity.CSS.getPropertyValue(element, property), 0 ];
        }
    };

    options.complete = function() {
        if (complete) {
            complete.call(this, this);
        }

        this.style.overflow = originalOverflows.overflow;
        this.style.overflowY = originalOverflows.overflowY;
    };

    velocity.animate(element, originalValues, options);
};