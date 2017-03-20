/* we need fetch to do the http requests */
const fetch = require('node-fetch');

/* config options */
const openApiBaseUrl = 'https://gateway.saxobank.com/openapi';
const oAuthTokenEndpoint = 'https://live.logonvalidation.net/token';
const appKey = '739fd0896ffe43f8af7795ff4ecd6764';
const appSecret = '30c74ba473c44ae5844c91c6cf3f507e';

/* check if we should ebug output */
const DEBUG = process.argv.indexOf('-v') > -1;


// -- Helper Methods --

/**
 * Output to console if DEBUG const is truthy
 */
function debugLog() {
	if (!DEBUG) return;
	var args = Array.prototype.slice.call(arguments);
	args.unshift('[', new Date().toISOString(), '] ');
	console.log.apply(console, args);
}

/**
 * Handle process exit - don't actually exit if debugging
 * @param {number} exitCode - The exitcoe to exit the process with
 */
function endWithExitCode(exitCode) {
	if (DEBUG) {
		debugLog('Faking exit (due to DEBUG=true) with exit code: ', exitCode);
	}
	else if (exitCode) {
		console.log('FAIL');
		process.exit(exitCode);
	}
	else {
		console.log('OK');
		process.exit();
	}
}


// -- Transport methods --

/**
 * fetch anonymous OAuth Token
 * @returns Promise - Resolve with "$Scheme $Token" or Reject with exception
 */
function getAnonymousOAuthToken() {
	debugLog('getToken called');

	return fetch(oAuthTokenEndpoint, {
		method: 'post',
		headers: {
			authorization: "Basic " + new Buffer(appKey + ":" + appSecret).toString('base64'),
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	})
		.then(function (response) {
			return response.json()
		})
		.then(function (response) {
			debugLog('Tokenreponse:\n', response);
			return response.token_type + ' ' + response.access_token;
		})
		.catch(function (ex) {
			return Promise.reject(ex);
		});
}

/**
 * Fetch openapi endpoint
 *
 * @param endpoint - endpoint to cal relative to /openapi basepath
 * @param oAuthToken - token to send in authorization header
 * @returns Promise - Resolve with { status: <status code>, body: <json converted object>} or Reject with exception
 */
function getEndpoint(endpoint, oAuthToken) {
	debugLog('getEndpoint("' + endpoint + '") called');

	return fetch(openApiBaseUrl + endpoint, { method: 'get', headers: { authorization: oAuthToken } })
		.then(function (response) {
			return response.json().then(function (body) {
				return {
					status: response.status,
					body: body
				};
			});
		})
		.catch(function (ex) {
			return Promise.reject(ex);
		});
}

/**
 * success test for client, accounts & netposition endpoints - status must be 200
 * @param result - { status: <status code>, body: <json converted object>}
 * @returns true/false
 */
function stdSuccessTest(result) {
	return success = result.status === 200;
}

/**
 * Success test for the balance endpoint - status must be 200 and CashBalance must be non zero
 * @param result - { status: <status code>, body: <json converted object>}
 * @returns true/false
 */
function balanceSuccessTest(result) {
	return result.status === 200 && result.body.CashBalance > 0;
}

// --test methods --

/**
 * This method vill call all the endpints and synchonize the results into a single promise
 * @param oAuthToken - the token to send in the authorization header for the endpoints
 * @returns Promise - Resolve with array of results from endpoints
 */
function testEndpoints(oAuthToken) {
	debugLog('testEndpoints called');

	return Promise.all([
		getEndpoint('/port/v1/clients/me', oAuthToken).then(stdSuccessTest),
		getEndpoint('/port/v1/accounts/me', oAuthToken).then(stdSuccessTest),
		getEndpoint('/port/v1/netpositions/me', oAuthToken).then(stdSuccessTest),
		getEndpoint('/port/v1/balances/me', oAuthToken).then(balanceSuccessTest)
	]);
}

/**
 * loop over results and figure out comnbined success or failure
 * @param results - array of results from the endpoints called
 */
function handleTestResults(results) {
	var success = true;
	debugLog('handleTestResults called');

	for (var i = 0, l = results.length; i < l; i++) {
		if (!results[i]) {
			endWithExitCode(1);
			return;
		}
	}
	endWithExitCode(0);
}

/** Main program **/

if (DEBUG) {
	debugLog('-- Simple External Check of MCS availability -- ');
}

Promise.resolve()
	.then(getAnonymousOAuthToken)
	.then(testEndpoints)
	.then(handleTestResults)
	.catch(function (ex) {
		debugLog('Exception:\n', ex)
		endWithExitCode(1);
	});

