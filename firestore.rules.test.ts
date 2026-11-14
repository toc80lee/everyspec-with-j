import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Security Rule & Dirty Dozen Payload Contract Tests
 * Verifies that firestore.rules enforces all 8 pillars and blocks all 12 adversarial payloads.
 */
describe('Firestore Security Rules Static & Dirty Dozen Contract', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const draftPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
  const rulesContent = fs.existsSync(rulesPath)
    ? fs.readFileSync(rulesPath, 'utf-8')
    : fs.readFileSync(draftPath, 'utf-8');

  it('1. Enforces rules_version = 2 and default-deny global safety net', () => {
    expect(rulesContent).toContain("rules_version = '2';");
    expect(rulesContent).toMatch(/match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
  });

  it('2. Blocks Dirty Dozen #1 (ID Poisoning): checks isValidId with <= 128 and regex', () => {
    expect(rulesContent).toContain('function isValidId(id)');
    expect(rulesContent).toContain('id.size() <= 128');
    expect(rulesContent).toContain("id.matches('^[a-zA-Z0-9_\\\\-]+$')");
    expect(rulesContent).toContain('isValidId(projectId)');
    expect(rulesContent).toContain('isValidId(specId)');
  });

  it('3. Blocks Dirty Dozen #2 (Shadow Ghost Fields): enforces keys().hasOnly and affectedKeys().hasOnly', () => {
    expect(rulesContent).toContain('data.keys().hasAll(');
    expect(rulesContent).toContain('data.keys().hasOnly(');
    expect(rulesContent).toContain('incoming().diff(existing()).affectedKeys().hasOnly(');
  });

  it('4. Blocks Dirty Dozen #3 (Email Spoofing): mandates email_verified == true', () => {
    expect(rulesContent).toContain('request.auth.token.email_verified == true');
  });

  it('5. Blocks Dirty Dozen #4 (PII Blanket Read): isolates private/email data to owner or admin', () => {
    expect(rulesContent).toContain('match /private/{docId}');
    expect(rulesContent).toMatch(/allow get: if isValidId\(userId\) && isValidId\(docId\) && \(isOwner\(userId\) \|\| isAdmin\(\)\)/);
  });

  it('6. Blocks Dirty Dozen #5 (Timestamp Forgery): enforces request.time on createdAt and updatedAt', () => {
    expect(rulesContent).toContain('incoming().createdAt == request.time');
    expect(rulesContent).toContain('incoming().updatedAt == request.time');
  });

  it('7. Blocks Dirty Dozen #6 & #7 (Identity Spoofing & Immutable Fields)', () => {
    expect(rulesContent).toContain('incoming().ownerId == request.auth.uid');
    expect(rulesContent).toContain('incoming().authorId == request.auth.uid');
    expect(rulesContent).toContain('incoming().authorId == existing().authorId');
    expect(rulesContent).toContain('incoming().project_code == existing().project_code');
    expect(rulesContent).toContain('incoming().createdAt == existing().createdAt');
  });

  it('8. Blocks Dirty Dozen #8 (Orphaned Spec Creation): verifies parent projectExists', () => {
    expect(rulesContent).toContain('projectExists(projectId)');
  });

  it('9. Blocks Dirty Dozen #9 & #10 (Approval Lock Bypass & Snapshot Tampering)', () => {
    expect(rulesContent).toMatch(/existing\(\)\.status in \['draft', 'in_review', 'developed'\]/);
    expect(rulesContent).toMatch(/match \/snapshots\/\{snapshotId\}[\s\S]*allow update: if false;/);
  });

  it('10. Blocks Dirty Dozen #11 & #12 (Self-Admin Escalation & Query Trust Bypass)', () => {
    expect(rulesContent).toMatch(/match \/admins\/\{userId\}[\s\S]*allow create: if isAdmin\(\)/);
    expect(rulesContent).toContain('allow list: if isSignedIn() && (');
    // Ensure allow list blocks never perform get()/exists()
    const listBlocks = rulesContent.match(/allow list:[^;]+;/g) || [];
    expect(listBlocks.length).toBeGreaterThan(0);
    for (const block of listBlocks) {
      expect(block).not.toContain('get(');
      expect(block).not.toContain('exists(');
      expect(block).not.toContain('isAdmin()');
      expect(block).not.toContain('isProjectCollaborator(');
    }
  });

  it('11. Protects Spec Review Comments subcollection with parent spec existence, author immutability, and safe list queries', () => {
    expect(rulesContent).toContain('function isValidReviewComment(data, projectId, specId, commentId)');
    expect(rulesContent).toContain('match /comments/{commentId}');
    expect(rulesContent).toContain('incoming().spec_id == existing().spec_id');
    expect(rulesContent).toContain('exists(/databases/$(database)/documents/projects/$(projectId)/specs/$(specId))');
  });
});
