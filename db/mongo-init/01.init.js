db["article"].createIndex({ pinned: 1, updateAt: 1 });
db["comment-alt"].createIndex({ site: 1, parent: 1, id: 1 });
db["operation-history"].createIndex({ createAt: 1 });
db["user"].createIndex({ username: 1 }, { unique: true });

db["metadata"].createIndex({ providerId: 1, bookId: 1 }, { unique: true });
db["episode"].createIndex(
  { providerId: 1, bookId: 1, episodeId: 1 },
  { unique: true },
);

db["web-favorite"].createIndex({ userId: 1, novelId: 1 }, { unique: true });
db["web-favorite"].createIndex({ userId: 1, createAt: 1 });
db["web-favorite"].createIndex({ userId: 1, updateAt: 1 });

db["web-read-history"].createIndex({ userId: 1, novelId: 1 }, { unique: true });
db["web-read-history"].createIndex({ userId: 1, createAt: 1 });
db["web-read-history"].createIndex(
  { createAt: 1 },
  { expireAfterSeconds: 8640000 }, // 100 days
);

db["web-oplog"].createIndex({ providerId: 1, novelId: 1, createdAt: 1 });
db["web-oplog"].createIndex({ operator: 1, createdAt: 1 });
db["web-oplog"].createIndex({ createdAt: 1 });

db["wenku-favorite"].createIndex({ userId: 1, novelId: 1 }, { unique: true });
db["wenku-favorite"].createIndex({ userId: 1, createAt: 1 });
db["wenku-favorite"].createIndex({ userId: 1, updateAt: 1 });

db["wenku-oplog"].createIndex({ novelId: 1, createdAt: 1 });
db["wenku-oplog"].createIndex({ operator: 1, createdAt: 1 });
db["wenku-oplog"].createIndex({ createdAt: 1 });
