AutodeskNamespace("Autodesk.ADN.Viewing.Extension");
AutodeskNamespace("Autodesk.ADN.Viewing.Extension.HeatMapFloor");

Autodesk.ADN.Viewing.Extension.HeatMapFloor = function(viewer, options) {

    var ctr = 0;

    ////////////////////////////////////////////////////////////////////////////

    /* Private Variables and constructor */ 
    
    // Heat Map Floor constructor
    Autodesk.Viewing.Extension.call(this, viewer, options);
    var _self = this;
    var _viewer = viewer;

    // Settings configuration flags
    var progressiveRenderingWasOn = false,
        ambientShadowsWasOn = false,
        groundShadowWasOn = false;
    
    
    // Find fragmentId of a desired mesh by selection_changed_event listener
    var roofFrag = 1; 

    // simpleheat private variables
    var _heat, _data = [];
    // Configurable heatmap variables:
    // MAX-the maximum amplitude of data input
    // VAL-the value of a data input, in this case, it's constant
    // RESOLUTION-pixel density
    // FALLOFF-the rate a datapoint disappears
    var MAX = 2000, VAL = 1500, RESOLUTION = 30, FALLOFF = 10;

    // THREE.js private variables
    var _material, _texture, _bounds, _plane, Z_POS = -0.1; //3.44 for floor;

    ////////////////////////////////////////////////////////////////////////////
    
    /* Load, main, and unload functions */

    _self.load = function() {

        // Turn off progressive rendering and ambient shadows for nice look
        if (_viewer.prefs.progressiveRendering) {
            progressiveRenderingWasOn = true;
            _viewer.setProgressiveRendering(false);
        }
        if (_viewer.prefs.ambientShadows) {
            ambientShadowsWasOn = true;
            _viewer.prefs.set("ambientShadows", false);
        }
        
        _bounds = genBounds(roofFrag);        
        _heat = genHeatMap();
        _texture = genTexture();
        _material = genMaterial();

        // _plane = clonePlane();
        setMaterial(roofFrag, _material);
        
        animate();

        console.log("Heat Map Floor loaded.");
        return true;
    }

    // debugging: draws a sphere at a location
    function mark(width, height, z, color) {
        var asdfg = new THREE.SphereGeometry(0.1, 15);
        var asdfmat = new THREE.MeshBasicMaterial({
            color: color
        });
        _viewer.impl.matman().addMaterial(ctr, asdfmat, true);
        var asdfmesh = new THREE.Mesh(asdfg, asdfmat);
        asdfmesh.position.set(width, height, z);
        _viewer.impl.scene.add(asdfmesh);
    }
    
    _self.unload = function() {

        if (progressiveRenderingWasOn)
            _viewer.setProgressiveRendering(true);
        if (ambientShadowsWasOn) {
            _viewer.prefs.set("ambientShadows", true);
        }
        if (groundShadowWasOn) {
            _viewer.setGroundShadow(true);
        }
        
        progressiveRenderingWasOn = ambientShadowsWasOn = groundShadowWasOn = false;
        
        delete _viewer.impl.matman().materials.heatmap;
        _viewer.impl.scene.remove(_plane);
        
        console.log("Heat Map Floor unloaded.");
        return true;
    }
    
    // Animation loop for checking for new points and drawing them on texture
    function animate() {
        
        requestAnimationFrame(animate);
        _heat.add(receivedData());            
        _heat._data = decay(_heat._data);
        _heat.draw();

        _texture.needsUpdate = true;
        // setting var 3 to true enables invalidation even without changing scene
        _viewer.impl.invalidate(true, false, true);
    }
    
    ////////////////////////////////////////////////////////////////////////////

    /* Geometry/Fragment/Location functions */

    /*************************************************************************

     * Here might be the error. This should find the bounding box of the roof.
     * Also finds the minim
     * But the marks are in the correct expected locations on the model.
     * This is used in shaderMaterial to specify scaling factors (width, height)

    *************************************************************************/

    // Gets bounds of a fragment
    function genBounds(fragId) {
        var bBox = new THREE.Box3();        
        _viewer.model.getFragmentList()
            .getWorldBounds(fragId, bBox);

        // TODO: debugging
        mark(bBox.max.x, bBox.max.y, bBox.max.z, ctr++);
        mark(bBox.min.x, bBox.min.y, bBox.min.z, ctr++);
        
        var width = Math.abs(bBox.max.x - bBox.min.x);
        var height = Math.abs(bBox.max.y - bBox.min.y);
        var depth = Math.abs(bBox.max.z - bBox.min.z);

        // min is used to shift for the shader, the others are roof dimensions
        return {width: width, height: height, depth: depth, max: bBox.max, min: bBox.min};
    }

    ///////////////////////////////////////////////////////////////////////

    /* Heatmap functions */
    
    // Starts a heatmap
    function genHeatMap() {

        var canvas = document.createElement("canvas");
        canvas.id = "texture";
        canvas.width = _bounds.width * RESOLUTION;
        canvas.height = _bounds.height * RESOLUTION;
        document.body.appendChild(canvas);

        return simpleheat("texture").max(MAX);
    }

    // TODO: Replace with actually received data
    // returns an array of data received by sensors
    function receivedData() {

        return [Math.random() * $("#texture").width(),
                Math.random() * $("#texture").height(),
                Math.random() * VAL];
    }

    // decrements the amplitude of a signal by FALLOFF for decay over time
    function decay(data) {

        // removes elements whose amlitude is < 1
        return data.filter(function(d) {
            d[2] -= FALLOFF;
            return d[2] > 1;
        });
    }

    ///////////////////////////////////////////////////////////////////////

    /* Texture and material functions */
    
    // Creates a texture
    function genTexture() {
        
        var canvas = document.getElementById("texture");
        var texture = new THREE.Texture(canvas);
        return texture;
    }

    // generates a material
    function genMaterial() {

        var material;

        // shader uniforms
        // OFFSET_X and Y are texture shifts
        // corner is the vertex UV mapped to (0, 0)
        // width and height are fragment size
        // tex is texture
        var uniforms = {
            // OFFSET_X: {
            //     type: 'f',
            //     value: 0.05
            // },
            // OFFSET_Y: {
            //     type: 'f',
            //     value: 0.1
            // }, 
            corner: {
                type: 'v2',
                value: new THREE.Vector2(_bounds.min.x, _bounds.min.y)
            },
            z: {
                type: 'f',
                value: _bounds.max.z
            }, 
            width: {
                type: 'f',
                value: _bounds.width
            },
            height: {
                type: 'f',
                value: _bounds.height
            },
            tex: {
                type: 't',
                value: _texture
            }
        };
        
        material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: $("#vertexshader").text(),
            fragmentShader: $("#fragmentshader").text(),
            side: THREE.DoubleSide
        });

        // If an alpha texture of the surface exists,
        // then this works with a PlaneGeometry
        // material = new THREE.MeshBasicMaterial({
        //     map: _texture,
        //     side: THREE.DoubleSide,
        //     alphaMap: THREE.ImageUtils.loadTexture("mask.png")
        // });
        material.transparent = true;

        // register the material under the name "heatmap"
        _viewer.impl.matman().addMaterial("heatmap", material, true);
        
        return material;
    }

    ///////////////////////////////////////////////////////////////////////

    /* Rendering the heatmap in the Viewer */

    // copies a fragment and moves it elsewhere
    function clonePlane() {

        // To use native three.js plane, use the following mesh constructor
        geom = new THREE.PlaneGeometry(_bounds.width, _bounds.height);
        plane = new THREE.Mesh(geom, _material);
        plane.position.set(0, 0, _bounds.max.z);

        // // get the geometry information from the render proxy
        // var renderProxy = _viewer.impl.getRenderProxy(_viewer.model, roofFrag);
        // var geom = renderProxy.geometry;
        
        // plane = new THREE.Mesh(geom, _viewer.impl.getRenderProxy(_viewer.model, roofFrag).material);

        // // copies and positions the plane to be a clone of the roof
        // plane.matrix.copy(renderProxy.matrixWorld);
        // plane.matrixWorldNeedsUpdate = true;
        // plane.matrixAutoUpdate = false;
        // plane.frustumCulled = false;

        // // shifts THE ORIGINAL plane
        // var fragProxy = _viewer.impl.getFragmentProxy(_viewer.model, roofFrag);
        // fragProxy.getAnimTransform();
        
        // var offset = {

        //     x: 0 - fragProxy.position.x,
        //     y: 0 - fragProxy.position.y,
        //     z: Z_POS - fragProxy.position.z
        // };

        // fragProxy.offset = offset;

        // var position = new THREE.Vector3(
        //     - fragProxy.offset.x,
        //     - fragProxy.offset.y,
        //     - fragProxy.offset.z);

        // fragProxy.position = position;

        // fragProxy.updateAnimTransform();

        // creates a shiny overlay effect
        _viewer.impl.addOverlay("pivot", plane);

        return plane;
    }

    // directly sets the material of a fragId
    function setMaterial(fragId, material) {

        var renderProxy = _viewer.impl.getRenderProxy(
            _viewer.model,
            roofFrag);
        var geom = renderProxy.geometry;
        
        _viewer.model.getFragmentList().setMaterial(fragId, material);
        _viewer.impl.invalidate(true);
    }
}

// Extension registration
Autodesk.ADN.Viewing.Extension.HeatMapFloor.prototype =
    Object.create(Autodesk.Viewing.Extension.prototype);

Autodesk.ADN.Viewing.Extension.HeatMapFloor.prototype.constructor =
    Autodesk.ADN.Viewing.Extension.HeatMapFloor;

Autodesk.Viewing.theExtensionManager.registerExtension(
    "HeatMapFloor",
    Autodesk.ADN.Viewing.Extension.HeatMapFloor);

