// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_init.sql';
import m0001 from './0001_hc_daily_vitals.sql';
import m0002 from './0002_meal_title.sql';
import m0003 from './0003_insight_loop.sql';
import m0004 from './0004_hc_more.sql';
import m0005 from './0005_report_values.sql';
import m0006 from './0006_advisor_cards.sql';
import m0007 from './0007_advisor_attachments.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007
    }
  }
  