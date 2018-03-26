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
var vs = "\n    attribute vec4 attr_position;\n\n    void main() {\n        gl_Position = attr_position;\n    }\n";
var fs = "\n    precision mediump float;\n    \n    void main() {\n        gl_FragColor = vec4(1, 0, 0.5, 1);\n    }\n";
var TriangleProgram = /** @class */ (function (_super) {
    __extends(TriangleProgram, _super);
    function TriangleProgram(gl) {
        return _super.call(this, gl, vs, fs) || this;
    }
    TriangleProgram.prototype.render = function (a, b, c) {
        // Convert vertices to array
        var data = [
            a.x, a.y,
            b.x, b.y,
            c.x, c.y
        ];
        // set the current program for the gl context
        this.useCurrentProgram();
        // create new buffer in which to place our point data
        var buffer = this.useNewCurrentBuffer();
        // load point data into the current buffer
        this.loadDataIntoCurrentBuffer(data);
        // get location of our vertex attribute
        var attribute = this.getPositionAttribute();
        // map our buffer (data) to the position attribute on the shader (with instruction)
        this.assignBufferToAttribute(buffer, attribute, {
            size: 2,
            type: this.gl.FLOAT,
            normalize: false,
            stride: 0,
            offset: 0 // start at the beginning of the buffer
        });
        // determine the number of times to draw (based on number of points)
        var count = Math.floor(data.length / 2);
        // draw using mode "TRIANGLES"
        this.drawArrays(this.gl.TRIANGLES, 0, count);
    };
    TriangleProgram.prototype.loadDataIntoCurrentBuffer = function (data) {
        // load data into the current buffer (positionBuffer) with static draw usage
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.STATIC_DRAW);
    };
    TriangleProgram.prototype.getPositionAttribute = function () {
        // locate using name of attribute
        return this.getAttribute('attr_position');
    };
    return TriangleProgram;
}(util_1.ProgramApiBase));
exports.TriangleProgram = TriangleProgram;
//# sourceMappingURL=triangle.js.map