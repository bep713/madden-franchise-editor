// Response shapes of the schedule IPC channels (main/handlers/scheduleHandler.js)
// and franchise:find-tables-by-name (FranchiseFileManager.findTablesByName).

// schedule:get-start-times. The times are ISO strings.
export interface ScheduleStartTimes {
    currentTime: string;
    seasonYear: number;
    epochStart: string;
    preseasonStart: string;
    regularSeasonStart: string;
}

// franchise:find-tables-by-name entry
export interface TableSummary {
    id: number;
    name: string;
    recordCount: number;
}
