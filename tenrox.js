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
var winston = require('winston');
var colors = require('colors');

var colorMap = new Map();
winston.level = process.env.LOG_LEVEL;

var cookie = null;
var opts = null;

getSession(process.env.TENROX_HOST,
    process.env.TENROX_ORG,
    process.env.TENROX_USER,
    process.env.TENROX_PASS)
    .then(processTimeSheet)
    .catch(function (error) {
        console.log("Error: " + error);
    });

function processTimeSheet(session) {
    defer = q.defer();
    getUniqueUserId(session)
        .then(function (uniqueUserId) {
            return getTimeSheetInfo(session, uniqueUserId, new Date());
        })
        .then(processFile)
        // .then(assignTaskIds)
        // .then(writeEntries);
        .then(console.log)
        .catch(function (error) {
            console.log("Error: " + error);
        });
    // TODO: check totals and update if different?

    return defer.promise;
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

function processFile() {
    var filename = 'c:\\users\\lwalters\\docs\\proj\\timesheet_data.txt'
    defer = q.defer();
    var summary = {};
    var current = '';
    var daytotal = 0;
    var lineReader = require('readline').createInterface({
        input: require('fs').createReadStream(filename)
    });

    lineReader.on('line', function (input) { parse(input, summary) });
    lineReader.on('close', function () {
        defer.resolve(summary);
    });
    return defer.promise;
}

function parse(line, summary) {
    winston.log('info', line);
    if (line[0] == '#')
        return;
    if (line.match(/^\d+\/\d+$/)) {
        current = line;
        summary[current] = {
            'daytotal': 0
        };
    } else if (line.match(/^([^,]+),(.+)\b(\d+)$/)) {
        match = line.match(/^([^,]+),(.+)\b(\d+)$/);
        winston.log('info', ' id:', match[1], '\n comments:', match[2], '\n minutes:', match[3]);
        if (!(match[1] in summary[current])) {
            summary[current][match[1]] = {
                'comments': '',
                'minutes': 0
            };
        }
        summary[current][match[1]].comments += match[2];
        summary[current][match[1]].minutes += Number(match[3]);
        summary[current].daytotal += Number(match[3]);
    }
}
