// Copyright 2014 litl, LLC. All Rights Reserved.

var ashlar = new function() {

    // Layout trees

    // An ashlar layout tree is a binary tree where each inner node defines either
    // a vertical or a horizontal split, and leaf nodes correspond to individual
    // photos.

    var leafNode = function(data) {
        return {data: data};
    };

    var vertNode = function(left, right) {
        return {data: 'v', left: left, right: right};
    };

    var horizNode = function(left, right) {
        return {data: 'h', left: left, right:right};
    };

    var isVert = function(node) {
        return node.data === "v";
    };

    var isHoriz = function(node) {
        return node.data === "h";
    };

    var isLeaf = function(node) {
        return typeof node.data === "number";
    };

    var leftThenRight = function(node) {
        var children = [];
        if (node.left) {
            children.push(node.left);
        }
        if (node.right) {
            children.push(node.right);
        }
        return children;
    };

    var expandTree = function(node) {
        var nodes = [node];
        var children = leftThenRight(node)
        for (var i=0 ; i < children.length ; i++) {
            var childNodes = expandTree(children[i]);
            for (var j=0 ; j < childNodes.length ; j++) {
                nodes.push(childNodes[j]);
            }
        }
        return nodes;
    };

    // Split id list into even halves as valued by their priorities.
    var splitIds = function(ids, photos) {
        var tot = 0;
        for (id in ids) {
            tot += photos[id].priority;
        }

        var target = tot / 2;
        for (var runningTot=0, i=0 ; (runningTot < target) && (i < (ids.length - 1)) ; i++) {
            runningTot += photos[i].priority;
        }

        return [ids.slice(0, i), ids.slice(i)];
    };

    var range = function(start, end) {
        var r = [];
        for (var i = start; i < end; i++) {
            r.push(i);
        }
        return r;
    };

    // Create binary tree defining a layout for a list of ids
    // given a list of relative priority values.
    var makeTree = function(photos, ids, layer) {
        ids = ids || range(0, photos.length);
        layer = layer || 0;

        if (ids.length === 1) {
            return leafNode(ids[0]);
        }

        // Split the ids between the left and right children such
        // that each side of the split is ~ equal in importance.
        var sides = splitIds(ids, photos);
        var leftIds = sides[0];
        var rightIds = sides[1];

        // Alternate between vertical and horizontal splits
        // at each level of the tree.
        var nodeFunc = [vertNode, horizNode][layer % 2];
        return nodeFunc(leftIds ? makeTree(photos, leftIds, layer + 1) : null,
                         rightIds ? makeTree(photos, rightIds, layer + 1) : null);
    };

    // ## Defining constraints

    // A layout tree is mapped to a specific concrete layout at a given
    // width by solving a system of linear equations. Each inner node
    // defines one such equation.

    // Returns a vector defining the left side of a zero-valued linear
    // equation the requirements of the tree rooted
    // at the specified node.
    var widthConstraint = function(node, photos) {
        // The children of horizontal nodes must be equal in width. We
        // arbitrarily pass on the constraint from the left child here.
        if (isHoriz(node)) {
            return widthConstraint(node.left, photos);
        }

        // Vertical splits constrain the widths such that the total width
        // at that node is the sum of its child nodes'.
        if (isVert(node)) {
            var left = widthConstraint(node.left, photos);
            var right = widthConstraint(node.right, photos);
            return left.add(right);
        }

        // The width of the layout defined by a leaf node is the width
        // of the single photo.
        var constraint = [];
        for (var i=0 ; i < photos.length ; i++) {
            constraint[i] = (i === node.data) ? 1.0 : 0;
        }
        return Vector.create(constraint);
    };

    // Despite representing the *height* requirements of the tree
    // rooted at this node, the vector returned is in *width* space, a
    // feat achieved by representing the heights in terms of the h/w
    // aspect ratios of the leaf nodes.
    var heightConstraint = function(node, photos) {
        // Horizontal splits constrain the heights such that the total height
        // at that node is the sum of its child nodes.
        if (isHoriz(node)) {
            var left = heightConstraint(node.left, photos);
            var right = heightConstraint(node.right, photos);
            return left.add(right);
        }

        // The children of vertical nodes must be equal in height. We
        // arbitrarily pass on the constraint from the left child here.
        if (isVert(node)) {
            return heightConstraint(node.left, photos);
        }

        // Leaf nodes define a height equal the photo's h/w aspect ratio
        // times its width.
        var constraint = [];
        for (var i=0 ; i < photos.length ; i++) {
            constraint[i] = (i === node.data) ? photos[node.data].aspect : 0;
        }
        return Vector.create(constraint);
    };

    // ## Solving the system of equations

    // Calculate photo widths given the photos and layout width
    var solve = function(tree, photos, width) {
        // Start with a constraint that binds the outer width to its value.
        var constr = [widthConstraint(tree, photos).elements];

        var nodes = expandTree(tree);
        for (var i=0 ; i < nodes.length ; i++) {
            var node = nodes[i];

            if (isLeaf(node)) {
                continue;
            };

            // Each inner node provides a constraint. Each constraint is
            // represented as a vector which defines the left side of a
            // 0-valued linear equation. Vertical splits define height
            // symmetries while horizontal splits define width symmetries.
            var constrain = isVert(node) ? heightConstraint : widthConstraint;
            var left = constrain(node.left, photos);
            var right = constrain(node.right, photos);
            constr.push(left.subtract(right).elements);
        }
        var A = Matrix.create(constr);

        // The outer box is bound to specified width; all other constraints
        // are valued zero.
        var b = [width];
        for (var j = 1; j < photos.length; j++) {
            b[j] = 0;
        }
        var B = Vector.create(b);

        var solution = A.inverse().multiply(B).round();

        return solution;
    };

    // ## Positioning the photos given a solution

    // Returns the concrete width of the layout rooted at the specified
    // node given the list of solved final widths for the photos.
    var nodeWidth = function(node, solution) {
        if (isHoriz(node)) {
            return nodeWidth(node.left, solution);
        }

        if (isVert(node)) {
            return (nodeWidth(node.left, solution) +
                    nodeWidth(node.right, solution));
        }

        // add 1 because sylvester vectors are 1-indexed
        return solution.e(node.data + 1);
    };

    // Returns the concrete height of the layout rooted at the specified
    // node given the list of the solved final widths for the photos.
    var nodeHeight = function(node, photos, solution) {
        if (isHoriz(node)) {
            return (nodeHeight(node.left, photos, solution) +
                    nodeHeight(node.right, photos, solution));
        }

        if (isVert(node)) {
            return nodeHeight(node.left, photos, solution);
        }

        // add 1 because sylvester vectors are 1-indexed
        return Math.floor(photos[node.data].aspect * solution.e(node.data + 1));
    };

    // Each tile in the layout defines an explicit position and size.
    var tile = function(x, y, width, height) {
        return {x: x, y: y, width: width, height: height};
    };

    // Create the ordered list of tile tuples for the specified tree
    // with the specified solution.
    var tileTree = function(tree, photos, solution, pos) {
        pos = pos || [0, 0];
        var x = pos[0];
        var y = pos[1];
        if (isLeaf(tree)) {
            // add one because sylvester vectors are 1 indexed.
            var width = solution.e(tree.data + 1);
            var height = Math.floor(photos[tree.data].aspect * solution.e(tree.data + 1));
            return [tile(x, y, width, height)];
        }

        var rightPos, right;
        var left = tileTree(tree.left, photos, solution, pos);
        if (isVert(tree)) {
            rightPos = [x + nodeWidth(tree.left, solution), y];
            right = tileTree(tree.right, photos, solution, rightPos);
        } else if (isHoriz(tree)) {
            rightPos = [x, y + nodeHeight(tree.left, photos, solution)];
            right = tileTree(tree.right, photos, solution, rightPos);
        }

        return left.concat(right);
    };

    // Bind the tree to a layout with the specified width given the h/w
    // aspect ratios of its leaf nodes.
    var bindTree = function(tree, photos, width, pos) {
        var solution = solve(tree, photos, width);
        return tileTree(tree, photos, solution, pos);
    };

    // ## API

    // Arrange the given photos into as many ashlar layouts as is
    // necessary by stacking layouts vertically with perLayout
    // photos in each. If perLayout is not specified, all photos
    // are arranged in a single layout.
    //
    // Returns a list of tiles with position and size information.
    this.layout = function(photos, width, perLayout) {
        perLayout = perLayout || photos.length;

        var chunk = null;
        var chunkTiles = null;
        var tiles = [];
        var top = 0;
        for (var i=0 ; i < photos.length ; i += perLayout) {
            chunk = photos.slice(i, i + perLayout);
            chunkTiles = bindTree(makeTree(chunk), chunk, width, [0, top]);
            for (var j=0 ; j < chunkTiles.length ; j++) {
                chunkTiles[j].img = chunk[j].img;
                tiles.push(chunkTiles[j]);
            }
            var last = tiles[tiles.length - 1];
            top += last.y + last.height;
        }
        return tiles;
    };
};
