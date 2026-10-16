const moment = require("moment");
const { utilService } = require("madden-franchise");

/**
 * Registers IPC handlers for schedule-related operations.
 * Moves epoch/start-time computation from renderer to main process
 * where raw field data (unformattedValue, offset bits) is accessible.
 * @param {Object} loggedIpc - Wrapped IPC with dev logging
 * @param {FranchiseFileManager} franchiseFileManager
 */
function registerScheduleHandlers(loggedIpc, franchiseFileManager) {
  /**
   * Get computed start times for a franchise schedule.
   * Returns epochStart, currentTime, seasonYear, preseasonStart, regularSeasonStart
   * as plain serializable values (ISO date strings + number).
   */
  loggedIpc.handle("schedule:get-start-times", async (event, fileId) => {
    try {
      if (!fileId) {
        throw new Error("Invalid arguments: fileId is required");
      }

      const entry = franchiseFileManager.activeFiles.get(fileId);
      if (!entry) {
        throw new Error(`File not found: ${fileId}`);
      }
      const file = entry.file;

      // Find the Scheduler table
      const schedulerTable = file.getTableByName("Scheduler");
      if (!schedulerTable) {
        throw new Error("Scheduler table not found");
      }

      await schedulerTable.readRecords();
      if (!schedulerTable.records || schedulerTable.records.length === 0) {
        throw new Error("Scheduler table has no records");
      }

      // Get epoch reference from first scheduler record
      const epochValue = schedulerTable.records[0].Epoch;
      if (!epochValue) {
        throw new Error("No epoch value found in scheduler");
      }

      // Resolve the epoch reference to table/row
      const epochReferenceData = utilService.getReferenceData(epochValue);
      const epochTable = file.getTableById(epochReferenceData.tableId);
      if (!epochTable) {
        throw new Error(`Epoch table not found: ${epochReferenceData.tableId}`);
      }

      await epochTable.readRecords();
      if (!epochTable.records || epochTable.records.length === 0) {
        throw new Error("Epoch table has no records");
      }

      const epochRecord = epochTable.records[epochReferenceData.rowNumber];
      if (!epochRecord) {
        throw new Error(
          `Epoch record at index ${epochReferenceData.rowNumber} not found`,
        );
      }

      // Extract epoch components — Month needs raw bit access
      const epochYear = epochRecord.Year + 1900;
      const epochMonth = epochRecord.fields.Month.unformattedValue.getBits(
        epochRecord.fields.Month.offset.offset,
        epochRecord.fields.Month.offset.length,
      );

      const epochStart = moment([
        epochYear,
        epochMonth,
        epochRecord.DayOfMonth,
        epochRecord.Hour,
        epochRecord.Minute,
        epochRecord.Second,
      ]);

      const currentTime = moment
        .unix(schedulerTable.records[0].CurrentTime)
        .utc()
        .add(epochStart.unix(), "s");
      const numYears = currentTime.year() - epochYear;
      const currentYear = epochYear + numYears;

      const preseasonStart = moment([currentYear, 7])
        .startOf("isoweek")
        .add(1, "d")
        .add(1, "w");
      const regularSeasonStart = moment(preseasonStart).add(4, "w");

      // Return serializable values (ISO strings for moments)
      return {
        currentTime: currentTime.toISOString(),
        seasonYear: numYears,
        epochStart: epochStart.toISOString(),
        preseasonStart: preseasonStart.toISOString(),
        regularSeasonStart: regularSeasonStart.toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to get schedule start times: ${error.message}`);
    }
  });
}

module.exports = { registerScheduleHandlers };
