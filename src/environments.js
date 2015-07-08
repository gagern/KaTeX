var fontMetrics = require("./fontMetrics");
var parseData = require("./parseData");
var ParseError = require("./ParseError");

var ParseNode = parseData.ParseNode;

/*
 * An environment definition is very similar to a function definition:
 *
 * it is declared with a name or a list of names, a set of properties
 * and a handler containing the actual implementation.
 *
 * The properties include:
 *  - numArgs: The number of arguments after the \begin{name} function.
 *  - argTypes: (optional) Just like for a function
 *  - allowedInText: (optional) Whether or not the environment is allowed inside
 *                   text mode (default false) (not enforced yet)
 *  - numOptionalArgs: (optional) Just like for a function
 * A bare number instead of that object indicates the numArgs value.
 *
 * The handler function will receive two arguments
 * - context: information and references provided by the parser
 * - args: an array of arguments passed to \begin{name}
 * The context contains the following properties:
 * - envName: the name of the environment, one of the listed names.
 * - parser: the parser object
 * - lexer: the lexer object
 * - positions: the positions associated with these arguments from args.
 * The handler must return a ParseResult.
 */

function defineEnvironment(names, props, handler) {
    if (typeof names === "string") {
        names = [names];
    }
    if (typeof props === "number") {
        props = { numArgs: props };
    }
    // Set default values of functions
    var data = {
        numArgs: props.numArgs,
        argTypes: props.argTypes,
        greediness: 1,
        allowedInText: !!props.allowedInText,
        numOptionalArgs: props.numOptionalArgs || 0,
        handler: handler
    };
    for (var i = 0; i < names.length; ++i) {
        module.exports[names[i]] = data;
    }
}

/**
 * Parse the body of the environment, with rows delimited by \\ and
 * columns delimited by &, and create a nested list in row-major order
 * with one group per cell.
 */
function parseArray(parser, result) {
    var row = [], body = [row], rowGaps = [];
    while (true) {
        var cell = parser.parseExpression(false, null);
        row.push(new ParseNode("ordgroup", cell, parser.mode));
        var next = parser.nextToken.text;
        if (next === "&") {
            parser.consume();
        } else if (next === "\\end") {
            break;
        } else if (next === "\\\\" || next === "\\cr") {
            var cr = parser.parseFunction();
            rowGaps.push(cr.value.size);
            row = [];
            body.push(row);
        } else {
            throw new ParseError("Expected & or \\\\ or \\end",
                                 parser.lexer, parser.pos);
        }
    }
    result.body = body;
    result.rowGaps = rowGaps;
    return new ParseNode(result.type, result, parser.mode);
}

// Arrays are part of LaTeX, defined in lttab.dtx so its documentation
// is part of the source2e.pdf file of LaTeX2e source documentation.
defineEnvironment("array", {
    numArgs: 1
}, function(context, args) {
    var colalign = args[0];
    // Currently only supports alignment, no separators like | yet.
    colalign = colalign.value.map ? colalign.value : [colalign];
            var cols = colalign.map(function(node) {
        var ca = node.value;
        if ("lcr".indexOf(ca) !== -1) {
                    return {
                        align: ca
                    };
        }
        throw new ParseError(
            "Unknown column alignment: " + node.value,
            context.lexer, context.positions[1]);
    });
    var res = {
        type: "array",
                cols: cols,
        hskipBeforeAndAfter: true // \@preamble in lttab.dtx
    };
    res = parseArray(context.parser, res);
    return res;
});
    
var matrixDelimiters = {
    "matrix": null,
    "pmatrix": ["(", ")"],
    "bmatrix": ["[", "]"],
    "vmatrix": ["|", "|"],
    "Vmatrix": ["\\Vert", "\\Vert"]
};

// The matrix environments of amsmath builds on the array environment
// of LaTeX, which is discussed above.
defineEnvironment(["matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix"], {
    numArgs: 0
}, function(context) {
    var delimiters = matrixDelimiters[context.envName];
    var res = {
        type: "array",
        hskipBeforeAndAfter: false // \hskip -\arraycolsep in amsmath
    };
    res = parseArray(context.parser, res);
    if (delimiters) {
        res = new ParseNode("leftright", {
            body: [res],
            left: delimiters[0],
            right: delimiters[1]
        }, context.mode);
    }
    return res;
});

// A cases environment (in amsmath.sty) is almost equivalent to
// \def\arraystretch{1.2}%
// \left\{\begin{array}{@{}l@{\quad}l@{}} … \end{array}\right.
defineEnvironment("cases", {
    numArgs: 0
}, function(context) {
    var res = {
        type: "array",
        arraystretch: 1.2,
        cols: [{
            align: "l",
            pregap: 0,
            postgap: fontMetrics.metrics.quad
        }, {
            align: "l",
            pregap: 0,
            postgap: 0
        }]
    };
    res = parseArray(context.parser, res);
    res.result = new ParseNode("leftright", {
        body: [res.result],
        left: "\\{",
        right: "."
    }, context.mode);
    return res;
});
