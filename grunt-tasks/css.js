var csso = require('csso');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');

function isToken(token, type) {
	return token instanceof Array && token[1] == type;
}

function findToken(list, type) {
	return _.find(list, function(item) {
		return isToken(item, type);
	});
}

/**
 * Finds all @imported files in CSS file and returns their paths and locations
 * inside CSS
 */
function findImports(css) {
	var tokens = csso.parse(css, 'stylesheet');
	var imports = [];
	tokens.forEach(function(token, i) {
		if (isToken(token, 'atrules')) {
			// is it @import rule?
			var kw = findToken(token, 'atkeyword');
			if (kw && kw[2][2].toLowerCase() == 'import') {
				var valueToken;
				var urlToken = findToken(token, 'uri');
				
				if (urlToken) {
					valueToken = findToken(urlToken, 'raw') || findToken(urlToken, 'string');
				} else {
					valueToken = findToken(urlToken, 'string');
				}
				if (!valueToken) return;

				var ruleStart = token[0].f;
				var ruleEnd = token[0].l;
				if (css.charAt(ruleEnd) == ';') {
					ruleEnd++;
				}

				imports.push({
					file: valueToken[2].replace(/^['"]|['"]$/g, ''),
					start: ruleStart,
					end: ruleEnd
				});
			}
		}
	});

	return imports;
}

/**
 * Compiles singe CSS file: concats all @imported file into singe one
 * @param {String} file Absolute path to CSS file
 * @param {Function} pathResolver Function that will resolve paths to imported file
 * @returns {String} Content of compiled file
 */
function compileCSSFile(file, pathResolver, alreadyImported) {
	alreadyImported = alreadyImported || {};
	alreadyImported[file] = true;

	var originalFile = fs.readFileSync(file, 'utf8');
	var imports = findImports(originalFile);
	if (!imports.length) {
		return originalFile;
	}

	var replacements = [];
	var reExternal = /^\w+\:\/\//;
	imports.forEach(function(imp) {
		if (reExternal.test(imp.file))
			return;
		
		var fullPath = pathResolver(imp.file, file);
		var replaceValue = '';

		if (!(fullPath in alreadyImported)) {
			alreadyImported[fullPath] = true;
			try {
				replaceValue = compileCSSFile(fullPath, pathResolver, alreadyImported);
			} catch (e) {
				throw 'Unable to read "' + imp.file + '" import in ' + file;
			}
		}

		replacements.push({
			start: imp.start,
			end: imp.end,
			value: replaceValue
		});
	});

	// actually replace imports
	while (replacements.length) {
		var r = replacements.pop();
		originalFile = originalFile.substring(0, r.start) + r.value + originalFile.substring(r.end);
	}

	return csso.justDoIt(originalFile, true);
}

module.exports.compileCSSFile = compileCSSFile;

if (!module.parent) {
	// console.log(findImports('@import url(file.css);@import url("file2.css");body{color: red} .item {background: red}'));
	// return;
	var pathResolver = function(file, originalFile) {
		var dirname = originalFile ? path.dirname(originalFile) : __dirname;
		if (file.charAt(0) == '/') {
			// resolve absolute file include
			file = file.replace(/^\/+/, '');
			dirname = path.join(__dirname,  'test/css/webroot');
		}
		return path.resolve(dirname, file);
	};

	var compiledCSS = compileCSSFile(pathResolver('./test/css/test.css'), pathResolver);
	console.log('Compiled size: ', compiledCSS.length);

	var minimized = csso.justDoIt(compiledCSS, true);
	console.log('Minimized size: ', minimized.length);
}
