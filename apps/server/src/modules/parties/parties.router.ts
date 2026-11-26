// apps/server/src/modules/parties/parties.router.ts
// Express router for Party Lifecycle, Waiting Lobby, Live Chat, and Announcements.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import * as partiesService from './parties.service.js';
import { PlayerRole } from '@runalive/shared';

export const partiesRouter = Router();

partiesRouter.use(requireAuth);

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const CreatePartySchema = z.object({
  maxMembers: z.number().int().min(2).max(50).optional(),
  lockWhenMatchStarts: z.boolean().optional(),
  revealSeekersOnMap: z.boolean().optional(),
  settings: z.record(z.any()).optional(),
});

const JoinPartySchema = z.object({
  partyCode: z.string().min(1).max(20),
});

const UpdateSettingsSchema = z.object({
  lockWhenMatchStarts: z.boolean().optional(),
  revealSeekersOnMap: z.boolean().optional(),
  customSettings: z.record(z.any()).optional(),
});

const SetReadySchema = z.object({
  isReady: z.boolean(),
});

const SetRoleSchema = z.object({
  role: z.enum([
    PlayerRole.HOST,
    PlayerRole.SEEKER,
    PlayerRole.RUNNER,
  ]),
});

const StartMatchSchema = z.object({
  name: z.string().optional(),
  boundaryCenterLat: z.number().optional(),
  boundaryCenterLng: z.number().optional(),
  boundaryRadiusMeters: z.number().optional(),
  boundaryShape: z.enum(['CIRCLE', 'RECTANGLE', 'POLYGON']).optional(),
  rectWidthMeters: z.number().optional(),
  rectHeightMeters: z.number().optional(),
  rectRotationDeg: z.number().optional(),
  polygonPoints: z.array(z.tuple([z.number(), z.number()])).optional(),
  totalRounds: z.number().int().min(1).max(10).optional(),
  roundDurationMinutes: z.number().int().min(1).max(60).optional(),
});

const PostChatSchema = z.object({
  message: z.string().min(1).max(500),
  matchId: z.string().uuid().optional(),
});

const PostAnnouncementSchema = z.object({
  message: z.string().min(1).max(500),
  type: z.enum(['SYSTEM', 'HOST', 'EVENT', 'WARNING', 'ELIMINATION']).optional(),
  metadata: z.record(z.any()).optional(),
  matchId: z.string().uuid().optional(),
});

// ── Endpoints ─────────────────────────────────────────────────────────────

// Host / Create party
partiesRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const input = CreatePartySchema.parse(req.body);
    const party = await partiesService.createParty(req.user!.id, input);
    res.status(201).json({ party });
  })
);

// Join party with code
partiesRouter.post(
  '/join',
  asyncHandler(async (req: Request, res: Response) => {
    const input = JoinPartySchema.parse(req.body);
    const party = await partiesService.joinParty(req.user!.id, input);
    res.status(200).json({ party });
  })
);

// Get party by code
partiesRouter.get(
  '/code/:code',
  asyncHandler(async (req: Request, res: Response) => {
    const code = req.params.code;
    const party = await partiesService.getPartyByCode(code as string);
    res.status(200).json({ party });
  })
);

// Get party by id
partiesRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const party = await partiesService.getPartyById(partyId);
    res.status(200).json({ party });
  })
);

// Leave party
partiesRouter.post(
  '/:id/leave',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const result = await partiesService.leaveParty(req.user!.id, partyId);
    res.status(200).json(result);
  })
);

// Toggle ready
partiesRouter.post(
  '/:id/ready',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const { isReady } = SetReadySchema.parse(req.body);
    const party = await partiesService.setMemberReady(partyId, req.user!.id, isReady);
    res.status(200).json({ party });
  })
);

// Assign role
partiesRouter.patch(
  '/:id/members/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const { role } = SetRoleSchema.parse(req.body);
    const party = await partiesService.setMemberRole(partyId, req.user!.id, targetUserId, role as PlayerRole);
    res.status(200).json({ party });
  })
);

// Kick member
partiesRouter.delete(
  '/:id/members/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const party = await partiesService.kickMember(partyId, req.user!.id, targetUserId);
    res.status(200).json({ party });
  })
);

// Update party settings
partiesRouter.patch(
  '/:id/settings',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const settings = UpdateSettingsSchema.parse(req.body);
    const party = await partiesService.updatePartySettings(partyId, req.user!.id, settings);
    res.status(200).json({ party });
  })
);

// Start match from party (freezes membership snapshot into match session)
partiesRouter.post(
  '/:id/start-match',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const config = StartMatchSchema.parse(req.body);
    const match = await partiesService.startMatchFromParty(partyId, req.user!.id, config);
    res.status(200).json({ match });
  })
);

// Get chat history
partiesRouter.get(
  '/:id/chat',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const messages = await partiesService.getChatHistory(partyId, limit);
    res.status(200).json({ messages });
  })
);

// Post chat message
partiesRouter.post(
  '/:id/chat',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const { message, matchId } = PostChatSchema.parse(req.body);
    const chat = await partiesService.postChatMessage(partyId, req.user!.id, message, matchId);
    res.status(201).json({ chat });
  })
);

// Get announcements
partiesRouter.get(
  '/:id/announcements',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const announcements = await partiesService.getAnnouncements(partyId, limit);
    res.status(200).json({ announcements });
  })
);

// Post announcement (host or system)
partiesRouter.post(
  '/:id/announcements',
  asyncHandler(async (req: Request, res: Response) => {
    const partyId = req.params.id as string;
    const { message, type, metadata, matchId } = PostAnnouncementSchema.parse(req.body);
    const announcement = await partiesService.postAnnouncement(
      partyId,
      req.user!.id,
      message,
      type || 'HOST',
      metadata || {},
      matchId
    );
    res.status(201).json({ announcement });
  })
);
