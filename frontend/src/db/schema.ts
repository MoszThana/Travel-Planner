import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 1. Users Table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
  pin: text('pin'), // 4-digit pin password
  createdAt: integer('created_at').notNull(),
});

// 2. Trips Table
export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  destination: text('destination').notNull(),
  startDate: integer('start_date').notNull(),
  endDate: integer('end_date').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
});

// 3. Trip Members Table (for collaborative trips)
export const tripMembers = sqliteTable('trip_members', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').notNull(), // 'owner' | 'editor' | 'viewer'
  joinedAt: integer('joined_at').notNull(),
});

// 4. Days Table (each trip contains multiple days)
export const days = sqliteTable('days', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id),
  dayNumber: integer('day_number').notNull(),
  date: integer('date').notNull(),
});

// 5. Activities Table (itinerary items under a specific day)
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  dayId: text('day_id').notNull().references(() => days.id),
  name: text('name').notNull(),
  time: text('time'), // "HH:MM" e.g., "08:30"
  notes: text('notes'),
  location: text('location'),
  lat: real('lat'),
  lng: real('lng'),
  transportType: text('transport_type'), // 'walk' | 'car' | 'train' | 'flight' | 'bus' | 'other'
  estCost: real('est_cost').default(0),
  actCost: real('act_cost').default(0),
  costCategory: text('cost_category'), // 'food' | 'transport' | 'hotel' | 'activity' | 'shopping' | 'emergency' | 'other'
  order: integer('order').notNull(), // for drag & drop sorting
  visited: integer('visited').default(0), // 0 = false, 1 = true
});

// 6. Group Expenses Table (payments made by individuals on the trip)
export const groupExpenses = sqliteTable('group_expenses', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id),
  payerId: text('payer_id').notNull().references(() => users.id),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(), // 'food' | 'transport' | 'hotel' | 'activity' | 'shopping' | 'other'
  splitType: text('split_type').notNull(), // 'equal' | 'custom'
  createdAt: integer('created_at').notNull(),
});

// 7. Expense Splits Table (who shared a specific payment and how much they owe)
export const expenseSplits = sqliteTable('expense_splits', {
  id: text('id').primaryKey(),
  expenseId: text('expense_id').notNull().references(() => groupExpenses.id),
  userId: text('user_id').notNull().references(() => users.id),
  amount: real('amount').notNull(),
});

// 8. Voting Table (member voting on suggested plans/activities)
export const votes = sqliteTable('votes', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id),
  itemId: text('item_id').notNull(), // Reference ID to activities or suggestions
  itemType: text('item_type').notNull(), // 'activity' | 'suggestion'
  userId: text('user_id').notNull().references(() => users.id),
  voteType: integer('vote_type').notNull(), // 1 = Like/Upvote, -1 = Dislike/Downvote
  createdAt: integer('created_at').notNull(),
});

// 9. Emergency Contacts Table
export const emergencyContacts = sqliteTable('emergency_contacts', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id),
  name: text('name').notNull(),
  relation: text('relation').notNull(),
  phone: text('phone').notNull(),
  note: text('note'),
});

// 10. System Settings Table (for storing tokens and global config)
export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// 11. Attachments Table (for files stored in OneDrive)
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id),
  activityId: text('activity_id').references(() => activities.id),
  name: text('name').notNull(),
  fileUrl: text('file_url').notNull(),
  oneDriveItemId: text('onedrive_item_id').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  uploadedBy: text('uploaded_by').references(() => users.id),
  createdAt: integer('created_at').notNull(),
});


