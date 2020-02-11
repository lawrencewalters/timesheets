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
winston.config.Console
if (process.env.hasOwnProperty('LOG_LEVEL')) {
    winston.level = process.env.LOG_LEVEL;
}

const logger = winston.createLogger({
    level: winston.level,
    format: winston.format.combine(winston.format.splat(), winston.format.simple()),
    transports: [
        new winston.transports.Console()
    ]
});

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
    .then(function (timesheetInfo) {
        return deleteCurrentEntries(session, timesheetInfo);
    })
    .then(function (timesheetInfo) {
        return postEntries(session,
            summarizedEntries,
            timesheetInfo.timesheetId,
            timesheetInfo.timesheet.StartDate,
            timesheetInfo.timesheet.EndDate);
    })
    .then(logger.info)
    .catch(function (error) {
        logger.error("Error: " + error);
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
 * Delete all the current entries of a given timesheet
 * @param {*} session 
 * @param {*} timesheetInfo full response from getTimeSheetInfo() {timesheetId, tasks, timesheet}
 * @returns {object} promise with original input param timesheetInfo (matching original getTimeSheetInfo)
 */
async function deleteCurrentEntries(session, timesheetInfo) {
    var defer = q.defer();
    for (var i = 0; i < timesheetInfo.timesheet.TimeEntries.length; i++) {
        var entry = timesheetInfo.timesheet.TimeEntries[i];
        logger.info("Deleting previous entry: %s / %s / %s (CreationDate: %s, in timesheet %s)",
            entry.UniqueId,
            entry.TaskName,
            (typeof entry.Notes !== 'undefined' && entry.Notes !== null) ? entry.Notes[0].Description : '',
            entry.CreationDate,
            entry.TimesheetUid);

        if (entry.TimesheetUid !== timesheetInfo.timesheetId) {
            defer.reject("Cannot delete entry from another timesheet: current timesheet " + timesheetInfo.timesheetId + ", existing entry timesheet " + entry.TimesheetUid + " from " + entry.CreationDate);
        } else {
            logger.debug("Deleting entry: " + JSON.stringify(entry, null, 4));
            await deleteEntry(session, entry.UniqueId);
        }
    }
    defer.resolve(timesheetInfo);
    return defer.promise;
}

/**
 * Uses the DELETE api/v2/TimeEntries/{id} API to delete an entry given it's id
 * @param {*} session 
 * @param {*} entryId 
 * @returns {object} promise with text description of api result
 */
function deleteEntry(session, entryId) {
    logger.info("delete Entry %s", entryId);
    defer = q.defer();
    session.headers["Content-Type"] = 'application/x-www-form-urlencoded';
    request.delete({
        headers: session.headers,
        url: "https://" + session.host + "/TEnterprise/api/v2/TimeEntries/" + entryId
    },
        function (error, response, body) {
            if (error) {
                defer.reject(error);
            } else {
                logger.debug('TimeEntries statusCode: %s %s', response.statusMessage, response.statusCode);
                logger.debug('TimeEntries body: %s', body);
                if (response.statusCode === 400) {
                    defer.reject('Error deleting time entry ' + response.statusMessage + ' ' + response.statusCode + ' ' + body);
                } else {
                    defer.resolve('TimeEntries statusCode: ' + response.statusMessage + ' ' + response.statusCode);
                }

            }
        });
    return defer.promise;
}

/**
 * 
 * @param {object} session
 * @param {object} entries 
 * @param {string} timesheetId 
 * @param {string} timesheetStartDate   date this time sheet starts
 * @param {string} timesheetEndDate date this timesheet ends
 * @returns {object} promise
 */
async function postEntries(session, entries, timesheetId, timesheetStartDate, timesheetEndDate) {
    var defer = q.defer();
    for (var day in entries) {
        logger.debug("Day: " + day);
        var entryDate = parseDate(day);
        for (var projectKey in entries[day]) {
            logger.debug("Projectkey: " + projectKey);
            //TODO: refactor original collection to make sure we're not mixing project keys with this total

            if (projectKey != 'daytotal') {
                logger.debug(entryDate);
                var d1 = new Date(entryDate);
                var dEnd = new Date(timesheetEndDate);
                dEnd.setTime(dEnd.getTime() + 1 * 24 * 60 * 60 * 1000); // make the end time be the end of the day, not the beginning
                var dStart = new Date(timesheetStartDate);
                if (d1.getTime() > dEnd.getTime() ||
                    d1.getTime() < dStart.getTime()) {
                    logger.warn("Entry skipped. Entry date (%s) is outside of this timesheet time frame (%s - %s) - please fix and retry",
                        entryDate,
                        timesheetStartDate,
                        timesheetEndDate);
                } else {
                    await postTimeWithNotes(session, timesheetId, tasks[projectKey], entries[day][projectKey]["notes"], entryDate, entries[day][projectKey]["minutes"]);
                }
            }
        }
    }
    defer.resolve('postEntries completed successfully');
    return defer.promise;
}

/**
 * @param {string} day shorthand date m/d numeric format, no zero padding expected (eg 1/5 or 2/28 or 12/25)
 */
function parseDate(day) {
    var entryDate = new Date();
    entryDate.setMonth(Number.parseInt(day.substring(0, day.indexOf('/'))) - 1);
    entryDate.setDate(Number.parseInt(day.substring(day.indexOf('/') + 1)));
    if (day.lastIndexOf('/') > 2) {
        entryDate.setFullYear(Number.parseInt(day.substring(day.lastIndexOf('/') + 1)));
    }
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
    logger.info("postTimeWithNotes %s %s %s %s", taskId, notes, entryDate, minutes);
    defer = q.defer();
    var putbody = {
        "Notes": [{
            "UniqueId": -1,
            "Description": notes,
            "NoteType": "NOTICE",
            "IsPublic": true
        }],
        "KeyValues": [{
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
    logger.debug(JSON.stringify(putbody));
    request.put({
        headers: session.headers,
        url: "https://" + session.host + "/TEnterprise/api/Timesheets/" + timesheetId + "?property=TIMEENTRYLITE",
        body: "=" + encodeURIComponent(JSON.stringify(putbody))
    },
        function (error, response, body) {
            if (error) {
                defer.reject(error);
                logger.error("error: " + error);
            } else {
                logger.info('timesheets statusCode: %s %s', response.statusMessage, response.statusCode);
                logger.info('timesheets body: %s', body);
                if (response.statusCode != 200) {
                    logger.error(response.statusCode + ' on entry with date ' + entryDate + ' ,description ' + notes);
                    logger.error('   this is due to:' + response.statusMessage);
                    defer.reject(error);
                }
                defer.resolve('timesheets statusCode: ' + response.statusMessage + ' ' + response.statusCode);
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
    logger.info('getting new session token');
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
                logger.debug("  error: %s", error);
                logger.debug("  body: %s", body);
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
    logger.info('getting unique user id');
    logger.debug(" session: %s", JSON.stringify(session, null, 4));
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
 * @returns {object} promise with results{timesheetId (just the id), tasks (just the tasks), timesheet (full API object)}
 */
function getTimesheetInfo(session, uniqueUserId, date) {
    defer = q.defer();
    logger.info("getting timesheet info");
    request.get({
        headers: session.headers,
        url: "https://" + session.host + "/TEnterprise/api/Timesheets/?UserId=" + uniqueUserId +
            "&anyDate=" + ("0" + (date.getMonth() + 1)).slice(-2) + '-' +
            ("0" + date.getDate()).slice(-2) + '-' +
            date.getFullYear()
    },
        function (error, response, body) {
            logger.debug("Request path: " + this.uri.href);
            if (error) {
                defer.reject(error);
            } else {
                logger.debug(JSON.stringify(response, null, 4));
                var parsed = JSON.parse(body);
                logger.debug(JSON.stringify(parsed, null, 4));
                showAssignmentDetails(parsed.AssignmentAttributes);
                defer.resolve({
                    "timesheetId": parsed.UniqueId,
                    "tasks": Object.keys(parsed.AssignmentAttributes).map(key => {
                        return {
                            TaskUid: parsed.AssignmentAttributes[key].TaskUid,
                            AssignmentName: parsed.AssignmentAttributes[key].AssignmentName,
                            ProjectName: parsed.AssignmentAttributes[key].ProjectName
                        }
                    }),
                    "timesheet": parsed
                });
            }
        }
    );
    return defer.promise;
}

function showAssignmentDetails(assignments) {
    logger.info("Current Assignments:");
    Object.keys(assignments).forEach(key => {
        logger.info("%s %s %s", assignments[key].TaskUid,
            assignments[key].AssignmentName,
            assignments[key].ProjectName);
    })
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
    logger.info(line);
    if (line[0] == '#') // ignore comment lines
        return;
    if (line.match(/^tasks=(.+)$/)) { // task definition lines
        match = line.match(/^tasks=(.+)$/);
        logger.debug(match[1]);
        match[1].split(",").map(function (val) {
            tasks[val.split(":")[0].replace(/\"/g, "").trim()] = val.split(":")[1].replace(/\"/g, "").trim();
        });
        logger.info("task mapping %s", JSON.stringify(tasks, null, 4));
        return;
    }
    if (line.match(/^\d+\/\d+(\/\d+)?$/)) { // dates - m/d or m/d/y "1/2" "1/2/2020" formats for dates
        current = line;
        summary[current] = {
            daytotal: 0
        };
    } else if (line.match(/^([^,]+),(.+),\s?\b(\d+)$/)) { // entries - task,notes about it,240
        match = line.match(/^([^,]+),(.+),\s?\b(\d+)$/);
        logger.info(' id: %s\n notes: %s\n minutes: %s', match[1], match[2], match[3]);

        parsedId = match[1];
        parsedComment = match[2];
        parsedMinutes = Number(match[3]);

        // logger.log('info', ' id:', parsedId, '\n comments:', parsedComment, '\n minutes:', parsedMinutes);
        if (!(parsedId in summary[current])) {
            summary[current][parsedId] = {
                'notes': parsedComment + ' (' + parsedMinutes.toString() + ')',
                'minutes': parsedMinutes
            };
        } else {
            summary[current][parsedId].notes += '\n' + parsedComment + ' (' + parsedMinutes.toString() + ')';
            summary[current][parsedId].minutes += parsedMinutes;
        }
        summary[current].daytotal += parsedMinutes;
    }
}