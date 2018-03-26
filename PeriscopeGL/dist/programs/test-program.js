"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var util_1 = require("../util");
var vs = "\n    attribute vec4 a_position;\n    void main() {\n        gl_Position = a_position;\n    }\n";
var fs = "\n    precision mediump float;\n    void main() {\n        gl_FragColor = vec4(1, 0, 0.5, 1);\n    }\n";
var TriangleProgramApi = /** @class */ (function (_super) {
    __extends(TriangleProgramApi, _super);
    function TriangleProgramApi(gl) {
        return _super.call(this, gl, vs, fs) || this;
    }
    TriangleProgramApi.prototype.render = function (triangleData) {
        var positions = [
            triangleData.ax,
            triangleData.ay,
            triangleData.bx,
            triangleData.by,
            triangleData.cx,
            triangleData.cy
        ];
        // clear canvas
        this.clearCanvasTransparent();
        // resize canvas
        this.resizeViewportWithCanvas();
        // set the current program for the gl context
        this.useCurrentProgram();
        // create new buffer in which to place our point data
        var buffer = this.useNewCurrentBuffer();
        // load point data into the current buffer
        this.loadPositionDataIntoCurrentBuffer(positions);
        // get location of our vertext attribute
        var attribute = this.getPositionAttribute();
        // map our buffer (data) to the position attribute on the shader (with instruction)
        this.setBufferForAttribute(buffer, attribute, {
            size: 2,
            type: this.gl.FLOAT,
            normalize: false,
            stride: 0,
            offset: 0 // start at the beginning of the buffer
        });
        // determine the number of times to draw (based on number of points)
        var count = Math.floor(positions.length / 2);
        // draw using mode "TRIANGLES"
        this.drawArrays(this.gl.TRIANGLES, 0, count);
    };
    TriangleProgramApi.prototype.loadPositionDataIntoCurrentBuffer = function (positions) {
        // create new floating point array from position data
        var data = new Float32Array(positions);
        // load data into the current buffer (positionBuffer) with static draw usage
        this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
    };
    TriangleProgramApi.prototype.getPositionAttribute = function () {
        // locate using name of attribute
        return this.getAttribute('a_position');
    };
    return TriangleProgramApi;
}(util_1.ProgramApiBase));
exports.TriangleProgramApi = TriangleProgramApi;
//# sourceMappingURL=test-program.js.map