Timesheets
==============

This is a basic nodejs app to make entering weekly timesheets into Tenrox easier, because the tenrox UI is terrible. 

Installation
----------------
Currently requires nodejs 9+
clone this repo, then `npm install` and you should be good.

Running
----------------

**Time tracking and summary**

Record your notes in a simple format by day, with task, notes, and minutes spent (see data_sample.txt for full example):

```
6/4
foo,some notes,15
bar,more notes,60
foo,again some other stuff,60
```

For aggregation and summary into single note per task per day, execute `timesheet.js`:

```
node timesheet.js data_sample.txt
```

to get output similar to:

```
1/2 8:45 bar : 3:30 : reviewing progress on PDP / PLP, getting Julie up to speed on cart, reviewing cart XYZ-770 status, assembling BMCR data for release, dev standup, reviewing status with AM team, internal dev checkin,
          baz : 5:15 :  ocapi/recs questions, ocapi/freefinder tsd,
1/3 5:00 bar : 2:15 :  reviewing and responding to tickets for PDP / PLP,  daily checkin, reviewing XYZ-532 issues with Nancy, daily standup,
          foo : 2:00 :  microsoft D365 call, updating TSD removing descoped items, adding order status, daily scrum,
          baz : 0:45 :  review functional questions / Joe's meeting with client,
13:45: bar:5:45 | baz:6:00 | foo:2:00 |
      1/2   1/3
 bar: 3:30   2:15
 baz: 5:15   0:45
 foo:        2:00
 ```

**Saving to Tenrox**

First, map the names you're using in your notes (eg **bar** or **baz**) to the actual task id's that Tenrox expects. Currently this is hardcoded in the top of `tenrox.js`:

```
var tasks = { "ash": "12454", "col": "10520", "intp": "4370", "intm": "4369", "sale":"4371", "hol": "22", "trvl":"4373"}
```
The best way to figure this out is to fill out your timesheet regularly in Tenrox, then make a single dummy entry in your local data file, run `tenrox.js` as specified below. This will save your current timesheet in **outputs/tenrox_timesheet_data.json**. Take a gander and find the **TaskUid** that's right for your task.

After your entries are recorded for the week, execute `tenrox.js`:

```
TIMESHEET_FILE='c:\\timesheet_data.txt' TENROX_USER=wu TENROX_PASS='tang4eva' TENROX_HOST=acme.tenrox.net TENROX_ORG=Acme node tenrox.js
```

Note everything is environment variables, and explained in the `tenrox.js` file.