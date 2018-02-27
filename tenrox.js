/** Tenrox API
REQUEST:
curl --data grant_type=password --data username=$TENROX_USER --data-urlencode "password=${TENROX_PASS}" "https://$TENROX_HOST/TEnterprise/api/token" --header "Content-Type: applica tion/json"  --header "OrgName: $TENROX_ORG" -i

TENROX_USER - tenrox username
TENROX_PASS - password
TENROX_HOST - host that serves your tenrox instance. double quote if you got fancy chars
TENROX_ORG - organization / company code for your tenrox instance. generally case sensitive ?

execute this script like:
$ TENROX_USER=asdf TENROX_PASS="bar" TENROX_HOST=acme.tenrox.net TENROX_ORG=Acme node tenrox.js

*/

var q = require('q');
var request = require('request');
var util = require('util');
var fs = require('fs');
var prettyjson = require('prettyjson');
var cookie = null;
var opts = null;

/*
auth - get a token
get unique user id (requires auth)
get current timesheet (gets tasks, timesheet id, unique user id)
write an entry (needs task id, timesheet id)

getTimeSheetInfo(session, unique user id, date) returns timesheet id, [{task name, id}]

assignTaskIds(session, entries) returns entries [{task id, date, hours, notes}]

writeEntry(session, timesheet id, task, date, hours, notes) returns promise

getSession()
    .then(getUniqueUserId)
    .then(getTimeSheetInfo)
    .then(getEntries)
    .then(assignTaskIds)
    .then(writeEntries);

*/

function auth(callback) {
    if (opts != null) {
        console.log('Using cached token');
        callback(null, opts);
        // }
        // else if (fs.existsSync('./access_token.json')) {
        //     console.log("loading token from disk");
        //     access_token = fs.readFileSync('./access_token.json', 'utf8');
        //     getUserId(access_token, callback);
    }
    else {
        console.log('getting new token');
        request.post({
            url: 'https://' + process.env.TENROX_HOST + '/TEnterprise/api/token',
            headers: { OrgName: process.env.TENROX_ORG },
            body: 'grant_type=password&username=' + process.env.TENROX_USER + '&password=' + encodeURIComponent(process.env.TENROX_PASS)
        },
            function (error, response, body) {
                if (error) {
                    callback(error);
                    return null;
                }
                cookie = response.headers['set-cookie'];
                access_token = JSON.parse(body).access_token;
                fs.writeFileSync('./access_token.json', access_token, 'utf-8');
                getUserId(access_token, callback);
            });
    }
}

function getOpts(token) {
    var auth = "Bearer " + token;
    return {
        headers: {
            "Cookie": cookie,
            "authorization": auth,
            "Content-Type": "application/json",
            OrgName: process.env.TENROX_ORG
        }
    };
}

function getUserId(access_token, callback) {
    opts = getOpts(access_token);
    request.get({
        headers: opts.headers,
        url: "https://" + process.env.TENROX_HOST + "/TEnterprise/api/v2/Users/?$filter=LoginName eq '" + process.env.TENROX_USER + "'"
    },
        function (error, response, body) {
            if (error) {
                callback("Error looking up user id: " + error);
                return null;
            } else if (body == 'Invalid token.') {
                callback("Error looking up user id: invalid token");
                return null;
            }

            opts.user_UniqueId = JSON.parse(body)[0].UniqueId;
            callback(null, opts);
        });
}

function makeEntry() {
    auth(function (error, opts) {
        if (error) {
            console.log(error);
            return null;
        }
        console.log("getting timesheet for user_id " + opts.user_UniqueId);
        var now = new Date();

        request.get({
            headers: opts.headers,
            url: "https://" + process.env.TENROX_HOST + "/TEnterprise/api/Timesheets/?UserId=" + opts.user_UniqueId +
            "&anyDate=" + ("0" + (now.getMonth() + 1)).slice(-2) + '-'
            + ("0" + now.getDate()).slice(-2) + '-'
            + now.getFullYear()
        },
            logTimeWithNotes);
    })
}

function logTimeWithNotes(error, response, body) {
    if (error) { console.log('timesheets error:', error); }
    console.log('timesheets statusCode:', response && response.statusCode);
    var timesheetId = JSON.parse(body).UniqueId;
    var now = new Date();
    fs.writeFileSync('./tenrox_timesheet_data.json', body);
    var putbody = {
        "Notes": [
            {
                "UniqueId": -1,
                "Description": "Test time entry from API",
                "NoteType": "NOTICE",
                "IsPublic": true
            }
        ],
        "KeyValues": [
            {
                "IsAttribute": true,
                "Property": "task",
                "Value": 4369
            },
            {
                "IsAttribute": false,
                "Property": "EntryDate",
                "Value": ("0" + (now.getMonth() + 1)).slice(-2) + '/' + ("0" + now.getDate()).slice(-2) + '/' + now.getFullYear()
            },
            {
                "IsAttribute": false,
                "Property": "RegularTime",
                "Value": 900
            }
        ]
    };
    opts.headers["Content-Type"] = 'application/x-www-form-urlencoded';
    console.log(JSON.stringify(putbody));
    request.put({
        headers: opts.headers,
        url: "https://" + process.env.TENROX_HOST + "/TEnterprise/api/Timesheets/" + timesheetId + "?property=TIMEENTRYLITE",
        body: "=" + encodeURIComponent(JSON.stringify(putbody))
    },
        function (error, response, body) {
            if (error) { console.log('timesheets error:', error); }
            console.log('timesheets statusCode:', response && response.statusCode);
            console.log('timesheets body:', body);
        });
}

function getSession(host, org, user, password) {
    defer = q.defer()
    console.log('getting new session token');
    request.post({
        url: 'https://' + host + '/TEnterprise/api/token',
        headers: { OrgName: org },
        body: 'grant_type=password&username=' + user + '&password=' + encodeURIComponent(password)
    },
        function (error, response, body) {
            if (error) {
                defer.reject(error);
            } else {
                defer.resolve({
                    "host": host,
                    "user": user,
                    "headers": {
                        "Cookie": response.headers['set-cookie'],
                        "authorization": "Bearer " + JSON.parse(body).access_token,
                        "Content-Type": "application/json",
                        OrgName: org
                    }
                });
            }
        });
    return defer.promise;
}

function getUniqueUserId(session) {
    defer = q.defer();
    console.log("getting unique user id");
    request.get({
        headers: session.headers,
        url: "https://" + session.host + "/TEnterprise/api/v2/Users/?$filter=LoginName eq '" + session.user + "'"
    },
        function (error, response, body) {
            if (error) {
                defer.reject(error);
            } else if (body === 'Invalid token.') {
                defer.reject("Error looking up user id: invalid token");
            } else if (body === '[]') {
                defer.reject("Error looking up user id for user '" + user + "'");
            } else {
                defer.resolve(JSON.parse(body)[0].UniqueId);
            }
        }
    );
    return defer.promise;
}

function getTimeSheetInfo(session, uniqueUserId, date) { // returns timesheet id, [{task name, id}]
    defer = q.defer();
    console.log("getting timesheet info");
    request.get({
        headers: session.headers,
        url: "https://" + session.host + "/TEnterprise/api/Timesheets/?UserId=" + uniqueUserId +
        "&anyDate=" + ("0" + (date.getMonth() + 1)).slice(-2) + '-'
        + ("0" + date.getDate()).slice(-2) + '-'
        + date.getFullYear()
    },
        function (error, response, body) {
            if (error) {
                defer.reject(error);
            } else {
                var parsed = JSON.parse(body);
                defer.resolve({
                    "timesheetId": parsed.UniqueId,
                    "tasks": Object.keys(parsed.AssignmentAttributes).map(key => {
                        return {
                            TaskUid: parsed.AssignmentAttributes[key].TaskUid,
                            AssignmentName: parsed.AssignmentAttributes[key].AssignmentName,
                            ProjectName: parsed.AssignmentAttributes[key].ProjectName
                        }
                    })
                });
            }
        }
    );
    return defer.promise;
}

function processTimeSheet(session) {
    defer = q.defer();
    getUniqueUserId(session)
        .then(function (uniqueUserId) {
            return getTimeSheetInfo(session, uniqueUserId, new Date());
        })
        // .then(getEntries)
        // .then(assignTaskIds)
        // .then(writeEntries);
        .then(console.log)
        .catch(function (error) {
            console.log("Error: " + error);
        });
    // TODO: map task IDs to what goes in the notes (TaskUid)
    //   - get a list of tasks ?
    // TODO: 1x update of all things
    // TODO: check totals and update if different?

    return defer.promise;
}

getSession(process.env.TENROX_HOST,
    process.env.TENROX_ORG,
    process.env.TENROX_USER,
    process.env.TENROX_PASS)
    .then(processTimeSheet)
    .catch(function (error) {
        console.log("Error: " + error);
    });