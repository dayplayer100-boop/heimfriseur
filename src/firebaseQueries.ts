import {
  getDocsFromServer,
  query,
  orderBy,
  documentId,
  limit,
  startAfter,
  type Query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
export const FIREBASE_PAGE_SIZE = 200;
export async function pagedDocuments(
  source: Query<DocumentData>,
  maximum = 10000,
) {
  const docs: QueryDocumentSnapshot<DocumentData>[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
  do {
    const page = await getDocsFromServer(
      query(
        source,
        orderBy(documentId()),
        limit(FIREBASE_PAGE_SIZE),
        ...(cursor ? [startAfter(cursor)] : []),
      ),
    );
    docs.push(...page.docs);
    if (docs.length > maximum)
      throw Object.assign(
        new Error(
          "Zu viele Datensätze. Bitte ältere Besuche archivieren oder den Betreiber kontaktieren.",
        ),
        { code: "HF_DATA_LIMIT" },
      );
    if (page.size < FIREBASE_PAGE_SIZE) break;
    cursor = page.docs.at(-1);
  } while (cursor);
  return { docs, size: docs.length };
}
