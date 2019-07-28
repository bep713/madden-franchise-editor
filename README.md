# madden-franchise-editor

An app for editing franchise files in Madden 19 and 20. Latest release: https://github.com/bep713/madden-franchise-editor/releases Instructions on how to build the source are at the bottom of this file.

## Features
- [19 ONLY] Schedule editor - An easy UI for changing franchise schedules. See the 'Schedule editor basic usage' section of this readme.
- [ALL] Table editor - Raw editor for changing any value in any table. Useful for testing or for modifying things that aren't in an easy UI yet.
- [ALL] Schema viewer - View the schema file in the app
- Offset tool - link to an app that I made that is helpful for finding offsets in the same place across different data and values.


Includes all real-life schedules from 1970-2019.

## How to Use

### Schedule editor basic usage
**NOTE**: always make a copy of your franchise before using this app. It has been tested lightly, but you never know what might happen.

Also, it is best to change the schedule during preseason week 1, since the app doesn't include a way to change the current week in game.

1. Click on 'Open a franchise file' at the welcome screen. Select your Madden franchise save in the file dialog. Select 'Open the schedule editor' from the list of options.

1. Your current franchise schedule will open in the editor, starting with Preseason Week 1. You can scroll through the weeks of the season at the top.

1. You can make changes to the schedule manually by hovering over either a team, day of week, or time. Every time you make a change, the franchise file will autosave for you.

1. When done making changes, all you have to do is go back to Madden and re-load the franchise file.

### Loading a schedule
You can load past or future schedules easily using the 'Replace all' button at the top right of the app.

1. Click on 'Replace all' at the top right

1. Select the file to replace all games with. The files included with this app will be named by their year (2019.json = 2019 NFL season).

1. Click the 'Replace all' button

After that, all* games will be replaced with games from the year that you chose and the franchise file will be automatically saved.

\* - Replacing all games will not include the playoff games, those will still be decided based on how your season goes as normal!

\* - The only file with preseason games included is 2019.json. If you replace with another year, the preseason games will remain as-is. If you replace the default schedule with 2019 and then replace with another year, the 2019 preseason games will remain in the schedule while the regular season games will be updated.

\* - Years prior to 2002 will not have the correct number of games in the season, as there weren't 32 teams in the league. I haven't worked on a fix for this yet, or even tested what happens when you load those schedules in game :)

### Coming Soon
- The ability to edit game scores is currently not included in the editor because the edited scores aren't reflected in the team stats or standings.

- The ability to change the current week. Say your franchise is currently at week 9 but you want to start the season over.

- Relocated teams are not currently supported.

- Better handling of historical seasons with less than 32 teams.

### Advanced options
You can right click on any game to bring up the advanced menu, which includes directly editing the hex or binary data for each game. The game will be updated and saved after you click on the 'save' button. This is helpful for editing game data that isn't editable from the UI yet.

## How it Works
First, a giant **thank you** to Stingray68 at FootballIdiot for finding this information. You can view his thread here: http://www.footballidiot.com/forum/viewtopic.php?f=114&t=21234

The app takes in a Madden franchise file and unpacks it using ZLIB deflate. The result is an uncompressed franchise database file that contains all information about your franchise. You can do the same without the app by using offzip.

Everything in the franchise file is structured in tables. The game data is taken from the *SeasonGame* table.

Each table is structured to include an index list, followed by records, followed optionally by a second records table. The games themselves are stored in the records portion. The index list defines the offsets for each field in the records table.

Madden also (thankfully) includes a schema definition which is accessible by using the Frosty editor. This file is named *franchise-schemas.ftx* and is found in the Legacy viewer under common -> franchise (click on the word 'franchise', don't expand it, and find the file in the panel below).

The schema file lists every index for each table in the franchise file, but it doesn't list them in the order that they appear in the file (unfortunately). We can map the index listing to the offset manually through trial-and-error and that's exactly what we did. Thankfully, there is a pattern to Madden's index tables and the process of mapping the schema definition to the actual record table can be automated now.

Anyway, back to the app. The games begin at offset 0x1CEB09 and start with the playoffs. These games aren't populated yet unless your franchise is currently in the playoffs (because the teams are yet to be determined). 

The preseason follows the playoff games, starting at offset 0x1CEEA1.

The regular season comes next at 0x1D05FD.

The superbowl is at 0x1D61FD after the regular season.

The app reads in each game and then organizes the data using known offsets. Here's an example of a game that has been simmed in the current week (49ers at Vikings):

    2E 82 00 05 2E 60 00 00 20 A8 01 45 00 00 00 00 00 00 00 00 2E 82 00 04 2E 60 00 24 20 A8 01 44 2E 7C 00 02 00 00 00 00 2A AE 00 03 80 00 02 6D 00 00 F5 00 00 00 F4 00 00 00 F3 00 80 00 00 00 80 00 02 6C 00 00 03 0C 81 80 24 21 E0 02 40 15 31 E3 83 80 00 50 00 00 01 00 30 01

We need to take that game hex data and convert it to binary in order to read all of the fields. The data that you see on the app is parsed from each game's binary data. When you change a team, for example, the app will lookup which value to include for the team that you chose, convert it to binary, replace the current value with the new value, repack the entire franchise file using ZLIB inflate, and save it.

### App structure
The app uses Electron, which uses Node.Js to make a desktop application.

### Files
The *data* folder contains data lookups for day of the week, season weeks, and teams. The offsets file contains the binary offset for each relevant field in a game record. Once we automate the schema to franchise file mapping, this file will not be needed.

The *schedules* folder contains all the schedule files from 1970-2019. These were scraped from pro-football-reference using the prf-scraper.js file in the root folder.

The *temp* folder is used to backup your franchise once its opened.

The *renderer* folder contains all app screens, styles, and scripts.

## Building the App Source
Prereqs:
- Node.Js installed
- IDE of your choice

1. Open a command prompt at the project root and type `npm install` to install all dependencies.

1. Run `gulp sass:watch` to watch for changes to the sass files. This will automatically compile the sass files to css.

1. Run `npm run start` in a separate terminal to run the app. Any changes made to the renderer code will refresh the app and automatically show. You don't need to stop and restart the app unless you change *main.js*.
