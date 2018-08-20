var help = `
Timesheet to tenrox updating

Parameters for this script:
 TENROX_USER - tenrox username
 TENROX_PASS - password
 TENROX_HOST - host that serves your tenrox instance. single quote if you got fancy chars
 TENROX_ORG - organization / company code for your tenrox instance. case sensitive
 TIMESHEET_FILE - filename that contains timesheet entries
 LOG_LEVEL - debug,info,warn,error

execute this script like:
$ TIMESHEET_FILE='c:\\timesheet_data.txt' TENROX_USER=wu TENROX_PASS='tang4eva' TENROX_HOST=acme.tenrox.net TENROX_ORG=Acme node tenrox.js
`

var q = require('q');
var request = require('request');
var fs = require('fs');
var readline = require('readline');
var winston = require('winston');

winston.level = 'error';
if (process.env.hasOwnProperty('LOG_LEVEL')) {
    winston.level = process.env.LOG_LEVEL;
}

var session = {},
    summarizedEntries = {},
    tasks = {};

checkEnv(['TIMESHEET_FILE', 'TENROX_HOST', 'TENROX_ORG', 'TENROX_USER', 'TENROX_PASS'])
    .then(function (result) {
        return processFile(process.env.TIMESHEET_FILE);
    })
    .then(function (result) {
        summarizedEntries = result;
        return getSession(process.env.TENROX_HOST,
            process.env.TENROX_ORG,
            process.env.TENROX_USER,
            process.env.TENROX_PASS)
    })
    .then(function (result) {
        session = result;
        return getUniqueUserId(session);
    })
    .then(function (uniqueUserId) {
        return getTimesheetInfo(session, uniqueUserId, parseDate(Object.keys(summarizedEntries)[0]));
    })
    // .then(assignTaskIds)
    .then(function (timesheetInfo) {
        return postEntries(session, summarizedEntries, timesheetInfo.timesheetId);
    })
    .then(winston.info)
    .catch(function (error) {
        winston.error("Error: " + error);
    });

/**
 * see if the necessary variables are present
 * @param {array} inputs environment variable names that are required to run this script
 */
function checkEnv(inputs) {
    defer = q.defer();
    inputs.forEach(input => {
        if (!process.env.hasOwnProperty(input)) {
            defer.reject('Missing environment variable: ' + input + '\n\n' + help);
        }
    });
    defer.resolve();
    return defer.promise;
}

/**
 * 
 * @param {object} session
 * @param {object} entries 
 * @param {string} timesheetId 
 * @returns {object} promise
 */
async function postEntries(session, entries, timesheetId) {
    var defer = q.defer();
    for (var day in entries) {
        winston.debug("Day: " + day);
        var entryDate = parseDate(day);
        for (var projectKey in entries[day]) {
            winston.debug("Projectkey: " + projectKey);
            //TODO: refactor original collection to make sure we're not mixing project keys with this total 
            if (projectKey != 'daytotal') {
                await postTimeWithNotes(session, timesheetId, tasks[projectKey], entries[day][projectKey]["notes"], entryDate, entries[day][projectKey]["minutes"]);
            }
        }
    }
    defer.resolve();
    return defer.promise;
}

/**
 * @param {string} day shorthand date m/d numeric format, no zero padding expected (eg 1/5 or 2/28 or 12/25)
 */
function parseDate(day) {
    var entryDate = new Date();
    entryDate.setMonth(Number.parseInt(day.substring(0, day.indexOf('/'))) - 1);
    entryDate.setDate(Number.parseInt(day.substring(day.indexOf('/') + 1)));
    return entryDate;
}

/**
 * 
 * @param {object} session 
 * @param {string} timesheetId
 * @param {string} taskId 
 * @param {string} notes 
 * @param {Date} entryDate 
 * @param {int} minutes 
 */
function postTimeWithNotes(session, timesheetId, taskId, notes, entryDate, minutes) {
    winston.info("postTimeWithNotes", taskId, notes, entryDate, minutes);
    defer = q.defer();
    var putbody = {
        "Notes": [
            {
                "UniqueId": -1,
                "Description": notes,
                "NoteType": "NOTICE",
                "IsPublic": true
            }
        ],
        "KeyValues": [
            {
                "IsAttribute": true,
                "Property": "task",
                "Value": taskId
            },
            {
                "IsAttribute": false,
                "Property": "EntryDate",
                "Value": ("0" + (entryDate.getMonth() + 1)).slice(-2) + '/' + ("0" + entryDate.getDate()).slice(-2) + '/' + entryDate.getFullYear()
            },
            {
                "IsAttribute": false,
                "Property": "RegularTime",
                "Value": minutes * 60
            }
        ]
    };
    session.headers["Content-Type"] = 'application/x-www-form-urlencoded';
    winston.debug(JSON.stringify(putbody));
    request.put({
        headers: session.headers,
        url: "https://" + session.host + "/TEnterprise/api/Timesheets/" + timesheetId + "?property=TIMEENTRYLITE",
        body: "=" + encodeURIComponent(JSON.stringify(putbody))
    },
        function (error, response, body) {
            if (error) {
                defer.reject(error);
            } else {
                winston.debug('timesheets statusCode:', response && response.statusCode);
                winston.debug('timesheets body:', body);
                defer.resolve('timesheets statusCode:' + response + ' ' + response.statusCode);
            }
        });
    return defer.promise;
}

/**
 * Tenrox API curl based request for testing getting a token 
 * curl --data grant_type=password --data username=$TENROX_USER --data-urlencode "password=${TENROX_PASS}" "https://$TENROX_HOST/TEnterprise/api/token" --header "Content-Type: application/json"  --header "OrgName: $TENROX_ORG" -i
 * 
 * @param {string} host 
 * @param {string} org 
 * @param {string} user 
 * @param {string} password 
 */
function getSession(host, org, user, password) {
    defer = q.defer()
    winston.info('getting new session token');
    request.post({
        url: 'https://' + host + '/TEnterprise/api/token',
        headers: { OrgName: org },
        body: 'grant_type=password&username=' + user + '&password=' + encodeURIComponent(password)
    },
        function (error, response, body) {
            if (error) {
                defer.reject(error);
            } else {
                if (body.indexOf("error") !== -1) {
                    defer.reject("getSession error: " + body);
                    return;
                }
                winston.debug(error);
                winston.debug(body);
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
    winston.info('getting unique user id');
    winston.debug(session);
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

/**
 * Get the timesheet for a given date... so we can edit it later 
 * @param {object} session 
 * @param {string} uniqueUserId 
 * @param {Date} date day in timesheet week
 * @returns {object} promise with results{timesheetId, tasks}
 */
function getTimesheetInfo(session, uniqueUserId, date) {
    defer = q.defer();
    winston.info("getting timesheet info");
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
                winston.info(body);
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

function processFile(filename) {
    defer = q.defer();
    var summary = {};
    var current = '';
    var daytotal = 0;

    try {
        var lineReader = readline.createInterface({
            input: fs.createReadStream(filename)
                .on('error', function (err) {
                    defer.reject('Error creating read stream for file ' + filename + ': ' + err);
                })
        });
        lineReader.on('line', function (input) { parse(input, summary) });
        lineReader.on('close', function () {
            defer.resolve(summary);
        });
        lineReader.on('error', function (err) {
            defer.reject('Error reading file lines for file ' + filename + ': ' + err);
        })
    } catch (err) {
        defer.reject("processFile error with file '" + filename + "': " + err);
    }

    return defer.promise;
}

/**
 * read a single line of timesheet data
 * @param {string} line single line of timesheet data file, represents project key, notes, minutes OR a date OR a tasks list
 * @param {object} summary keyed map of date => { daytotal, project key => {notes, minutes}}
 */
function parse(line, summary) {
    winston.info(line);
    if (line[0] == '#')
        return;
    if (line.match(/^tasks=(.+)$/)) {
        match = line.match(/^tasks=(.+)$/);
        winston.debug(match[1]); 
        match[1].split(",").map(function(val) {
            tasks[val.split(":")[0].replace(/\"/g,"").trim()] = val.split(":")[1].replace(/\"/g,"").trim();
        });
        winston.info("task mapping", tasks);
        return;
    }
    if (line.match(/^\d+\/\d+$/)) {
        current = line;
        summary[current] = {
            daytotal: 0
        };
    } else if (line.match(/^([^,]+),(.+)\b(\d+)$/)) {
        match = line.match(/^([^,]+),(.+)\b(\d+)$/);
        winston.info(' id:', match[1], '\n notes:', match[2], '\n minutes:', match[3]);
        if (!(match[1] in summary[current])) {
            summary[current][match[1]] = {
                'notes': '',
                'minutes': 0
            };
        }
        summary[current][match[1]].notes += match[2];
        summary[current][match[1]].minutes += Number(match[3]);
        summary[current].daytotal += Number(match[3]);
    }
}
