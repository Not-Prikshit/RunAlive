import React, { useState } from 'react';
import {
  BookOpen,
  ArrowRight,
  ArrowLeft,
  X,
  Compass,
  Users,
  Shield,
  Crosshair,
  MapPin,
  Layers,
  RotateCw,
  Radio,
  CheckCircle2,
  Sparkles,
  Share2,
  Lock,
  Eye,
  AlertTriangle,
} from 'lucide-react';

interface PlayerJournalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export const PlayerJournal: React.FC<PlayerJournalProps> = React.memo(({ isOpen, onClose, onComplete }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 10;

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleFinish = () => {
    localStorage.setItem('runalive_journal_completed', 'true');
    if (onComplete) onComplete();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#18181B]/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-3xl comic-card bg-[#FAF8F5] dark:bg-[#1E293B] border-[3px] border-[#18181B] dark:border-[#475569] shadow-[8px_8px_0px_#18181B] dark:shadow-[8px_8px_0px_#020617] rounded-2xl overflow-hidden flex flex-col relative my-auto max-h-[92vh]">
        {/* Sketchbook Top Ring Binder Strip */}
        <div className="bg-[#E8F0FE] dark:bg-[#0F172A] border-b-[2.5px] border-[#18181B] dark:border-[#475569] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-[#FBBC04] border-2 border-[#18181B] flex items-center justify-center shadow-[1.5px_1.5px_0px_#18181B]">
              <BookOpen className="w-4 h-4 text-[#18181B]" />
            </div>
            <div>
              <span className="font-heading font-black text-xs sm:text-sm text-[#18181B] dark:text-[#F8FAFC] uppercase tracking-wide">
                RunAlive Field Journal & Guidebook
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono text-[#4285F4] dark:text-[#93C5FD] font-bold">
                • EDITION 2.0
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-lg bg-white dark:bg-[#1E293B] border border-[#18181B] dark:border-[#475569] text-[#18181B] dark:text-[#F8FAFC]">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={handleFinish}
              className="p-1 rounded-lg hover:bg-[#FCE8E6] text-[#64748B] hover:text-[#EA4335] transition cursor-pointer"
              title="Close Guidebook"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Page Content Area */}
        <div className="p-5 sm:p-7 overflow-y-auto flex-1 text-[#18181B] dark:text-[#F8FAFC]">
          {/* PAGE 1: Welcome to RunAlive */}
          {currentPage === 1 && (
            <div className="space-y-4">
              <div className="inline-block comic-stamp bg-[#E8F0FE] dark:bg-[#1E3A8A] text-[#4285F4] dark:text-[#93C5FD] text-[10px]">
                ✦ FIELD MANUAL #01
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                Welcome to <span className="marker-highlight-yellow text-[#18181B]">RunAlive</span> Adventure!
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                RunAlive turns your real-world campus, park, or neighborhood into an energetic, physical multiplayer tag battlefield. Armed with live GPS tracking, shrinking boundary zones, and mutual capture protocols, players run, strategize, and compete in the open air.
              </p>

              <div className="grid sm:grid-cols-2 gap-3.5 pt-2">
                <div className="comic-card bg-white dark:bg-[#0F172A] p-4 border-2 border-[#18181B] dark:border-[#475569] shadow-[3px_3px_0px_#4285F4]">
                  <div className="flex items-center space-x-2 text-[#4285F4] font-heading font-black text-sm mb-1">
                    <Shield className="w-4 h-4" />
                    <span>THE HIDERS (BLUE TEAM)</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-normal">
                    Your goal is survival! Disperse across the play area, stay inside the safe zone, monitor your proximity danger meter, and outlast the round timer without getting caught.
                  </p>
                </div>

                <div className="comic-card bg-white dark:bg-[#0F172A] p-4 border-2 border-[#18181B] dark:border-[#475569] shadow-[3px_3px_0px_#EA4335]">
                  <div className="flex items-center space-x-2 text-[#EA4335] font-heading font-black text-sm mb-1">
                    <Crosshair className="w-4 h-4" />
                    <span>THE SEEKERS (RED TEAM)</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-normal">
                    Your goal is pursuit! Coordinate with your fellow seekers, pinch hiders against shrinking safe boundaries, close the distance, and initiate mutual capture verifications.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 2: Hosting and Joining */}
          {currentPage === 2 && (
            <div className="space-y-4">
              <div className="inline-block comic-stamp bg-[#FEF7E0] dark:bg-[#78350F] text-[#B45309] dark:text-[#FDE68A] text-[10px]">
                ✦ FIELD MANUAL #02
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                Hosting & Joining Matches
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Starting a match or gathering friends takes seconds. RunAlive automatically generates an unambiguous joining code for every new match.
              </p>

              <div className="p-4 bg-white dark:bg-[#0F172A] rounded-xl border-2 border-[#18181B] dark:border-[#475569] shadow-[3px_3px_0px_#18181B] dark:shadow-[3px_3px_0px_#020617] space-y-3">
                <span className="text-xs font-heading font-bold text-[#64748B] dark:text-[#94A3B8] uppercase block">
                  Example Room Invitation Code:
                </span>
                <div className="flex items-center space-x-3">
                  <div className="bg-[#FAF8F5] dark:bg-[#1E293B] border-2 border-[#18181B] dark:border-[#475569] px-4 py-2 rounded-xl font-mono text-xl sm:text-2xl font-black tracking-widest text-[#4285F4] dark:text-[#93C5FD]">
                    RUN-7K9PX2
                  </div>
                  <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    or enter 6 chars <span className="font-mono font-bold text-[#18181B] dark:text-white">7K9PX2</span> (case-insensitive)
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-2 pt-2 text-[11px] text-[#475569] dark:text-[#94A3B8]">
                  <div className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#34A853]" />
                    <span>Unique code per match automatically generated</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Share2 className="w-3.5 h-3.5 text-[#4285F4]" />
                    <span>1-Click Copy or Native Share invitation</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 3: The Game Lobby */}
          {currentPage === 3 && (
            <div className="space-y-4">
              <div className="inline-block comic-stamp bg-[#FCE8E6] dark:bg-[#7F1D1D] text-[#EA4335] dark:text-[#FECACA] text-[10px]">
                ✦ FIELD MANUAL #03
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                The Battle Lobby & Team Balance
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Before the match starts, players congregate in the Tactical Lobby. Here, teams are organized, ready checks are performed, and match rules are reviewed.
              </p>

              <div className="space-y-2.5 text-xs text-[#475569] dark:text-[#94A3B8]">
                <div className="flex items-start space-x-3 p-3 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155]">
                  <Users className="w-5 h-5 text-[#4285F4] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-heading font-bold text-[#18181B] dark:text-white block">
                      Team Assignment & Switching:
                    </span>
                    <span>
                      Players can switch between Hiders and Seekers, or the Host can use the 1-Click "Randomize Teams" button to balance squads automatically.
                    </span>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155]">
                  <CheckCircle2 className="w-5 h-5 text-[#34A853] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-heading font-bold text-[#18181B] dark:text-white block">
                      Player Readiness:
                    </span>
                    <span>
                      Every player marks themselves READY when prepared. The host initiates the match once everyone is geared up.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 4: Understanding the Map */}
          {currentPage === 4 && (
            <div className="space-y-4">
              <div className="inline-block comic-stamp bg-[#E6F4EA] dark:bg-[#064E3B] text-[#34A853] dark:text-[#A7F3D0] text-[10px]">
                ✦ FIELD MANUAL #04
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                Navigating the Tactical Map
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                The map is your primary operational interface during the match. It features standard street mapping and real satellite photography.
              </p>

              <div className="grid sm:grid-cols-3 gap-3 text-center text-xs">
                <div className="comic-card bg-white dark:bg-[#0F172A] p-3 border-2 border-[#18181B] dark:border-[#475569]">
                  <Layers className="w-6 h-6 text-[#4285F4] mx-auto mb-1.5" />
                  <span className="font-heading font-bold text-[#18181B] dark:text-white block text-xs">
                    Satellite Mode
                  </span>
                  <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] block mt-1">
                    Toggle high-resolution satellite imagery to identify campus buildings, pathways, and obstacles.
                  </span>
                </div>

                <div className="comic-card bg-white dark:bg-[#0F172A] p-3 border-2 border-[#18181B] dark:border-[#475569]">
                  <Radio className="w-6 h-6 text-[#34A853] mx-auto mb-1.5" />
                  <span className="font-heading font-bold text-[#18181B] dark:text-white block text-xs">
                    30s Periodic Sync
                  </span>
                  <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] block mt-1">
                    GPS updates are refreshed periodically to conserve battery while maintaining sub-meter accuracy.
                  </span>
                </div>

                <div className="comic-card bg-white dark:bg-[#0F172A] p-3 border-2 border-[#18181B] dark:border-[#475569]">
                  <Compass className="w-6 h-6 text-[#FBBC04] mx-auto mb-1.5" />
                  <span className="font-heading font-bold text-[#18181B] dark:text-white block text-xs">
                    GPS Center Pin
                  </span>
                  <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] block mt-1">
                    Tap the locate button anytime to snap the map directly to your live geographic position.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 5: Setting the Perimeter */}
          {currentPage === 5 && (
            <div className="space-y-4">
              <div className="inline-block comic-stamp bg-[#FEF7E0] dark:bg-[#78350F] text-[#B45309] dark:text-[#FDE68A] text-[10px]">
                ✦ FIELD MANUAL #05
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                Setting & Editing Perimeters
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Hosts can craft exact playing boundaries tailored to any location using 3 interactive geometry modes:
              </p>

              <div className="space-y-2.5 text-xs text-[#475569] dark:text-[#94A3B8]">
                <div className="p-3 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155]">
                  <span className="font-heading font-bold text-[#18181B] dark:text-white block mb-0.5">
                    1. Circle Boundary:
                  </span>
                  <span>Drag the center handle to reposition the arena. Drag the outer radius handle to expand or compress playing distance.</span>
                </div>

                <div className="p-3 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155]">
                  <span className="font-heading font-bold text-[#18181B] dark:text-white block mb-0.5">
                    2. Rotatable Rectangle:
                  </span>
                  <span>Drag corner handles to adjust width & height independently. Drag the rotation stem handle to orient the field along campus quads or park streets.</span>
                </div>

                <div className="p-3 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155]">
                  <span className="font-heading font-bold text-[#18181B] dark:text-white block mb-0.5">
                    3. Custom Freeform Polygon:
                  </span>
                  <span>Click anywhere to drop custom vertex points, drag existing vertices to sculpt boundaries around fences, ponds, or campus zones.</span>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 6: Understanding Gameplay */}
          {currentPage === 6 && (
            <div className="space-y-4">
              <div className="inline-block comic-stamp bg-[#E8F0FE] dark:bg-[#1E3A8A] text-[#4285F4] dark:text-[#93C5FD] text-[10px]">
                ✦ FIELD MANUAL #06
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                Match Flow & Dynamic Zones
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Matches are fast-paced and timed. As the match progresses, the arena dynamically evolves to keep the action intense:
              </p>

              <div className="p-4 bg-white dark:bg-[#0F172A] rounded-xl border-2 border-[#18181B] dark:border-[#475569] space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-[#FCE8E6] border border-[#EA4335] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-[#EA4335]" />
                  </div>
                  <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    <span className="font-heading font-bold text-[#18181B] dark:text-white block">
                      Shrinking Safe Boundary:
                    </span>
                    <span>
                      At configured intervals, the safe zone ring compresses inwards. Players outside the safe zone receive an audible warning to get back inside!
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-[#E6F4EA] border border-[#34A853] flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-[#34A853]" />
                  </div>
                  <div className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    <span className="font-heading font-bold text-[#18181B] dark:text-white block">
                      Headstart Seconds:
                    </span>
                    <span>
                      Hiders receive a 60-second headstart to scatter and conceal themselves before Seekers are released onto the field.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 7: The Hider Danger Meter */}
          {currentPage === 7 && (
            <div className="space-y-4">
              <div className="inline-block comic-stamp bg-[#FCE8E6] dark:bg-[#7F1D1D] text-[#EA4335] dark:text-[#FECACA] text-[10px]">
                ✦ FIELD MANUAL #07
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                The Hider Danger Meter
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                Hiders do not see exact Seeker coordinates on the map. Instead, your radar danger meter analyzes proximity and alerts you through 4 distinct threat levels:
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                <div className="p-3 bg-[#E6F4EA] dark:bg-[#064E3B] border-2 border-[#34A853] rounded-xl">
                  <span className="font-heading font-black text-[#1E8E3E] dark:text-[#A7F3D0] block">SAFE</span>
                  <span className="text-[10px] text-[#2E7D32] dark:text-[#D1FAE5] block mt-1">&gt; 100 meters away</span>
                </div>

                <div className="p-3 bg-[#FEF7E0] dark:bg-[#78350F] border-2 border-[#FBBC04] rounded-xl">
                  <span className="font-heading font-black text-[#B45309] dark:text-[#FDE68A] block">CAUTION</span>
                  <span className="text-[10px] text-[#92400E] dark:text-[#FEF3C7] block mt-1">50 - 100 meters</span>
                </div>

                <div className="p-3 bg-[#FEEFE3] dark:bg-[#7C2D12] border-2 border-[#FA7B17] rounded-xl">
                  <span className="font-heading font-black text-[#C2410C] dark:text-[#FFEDD5] block">DANGER</span>
                  <span className="text-[10px] text-[#9A3412] dark:text-[#FED7AA] block mt-1">20 - 50 meters</span>
                </div>

                <div className="p-3 bg-[#FCE8E6] dark:bg-[#7F1D1D] border-2 border-[#EA4335] rounded-xl animate-pulse">
                  <span className="font-heading font-black text-[#D93025] dark:text-[#FECACA] block">CRITICAL</span>
                  <span className="text-[10px] text-[#B91C1C] dark:text-[#FEE2E2] block mt-1">&lt; 20m • MOVE!</span>
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                💡 <strong>Tactical Tip:</strong> The meter gives you warning cues without revealing where you are hiding to the opposing team!
              </div>
            </div>
          )}

          {/* PAGE 8: How Capture Works */}
          {currentPage === 8 && (
            <div className="space-y-4">
              <div className="inline-block comic-stamp bg-[#FEF7E0] dark:bg-[#78350F] text-[#B45309] dark:text-[#FDE68A] text-[10px]">
                ✦ FIELD MANUAL #08
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                Mutual Capture Protocol
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                RunAlive enforces a fair, dual-confirmation capture protocol backed by strict 10-meter GPS proximity validation:
              </p>

              <div className="space-y-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                <div className="flex items-start space-x-3 p-2.5 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155]">
                  <span className="w-5 h-5 rounded-full bg-[#4285F4] text-white font-mono font-bold flex items-center justify-center text-[10px] shrink-0">1</span>
                  <span><strong>Tag & Request:</strong> Seeker closes in physically and taps "CLAIM CATCH" on the runner.</span>
                </div>
                <div className="flex items-start space-x-3 p-2.5 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155]">
                  <span className="w-5 h-5 rounded-full bg-[#FBBC04] text-[#18181B] font-mono font-bold flex items-center justify-center text-[10px] shrink-0">2</span>
                  <span><strong>Runner Notification:</strong> The tagged runner receives a real-time prompt to confirm or dispute the tag.</span>
                </div>
                <div className="flex items-start space-x-3 p-2.5 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155]">
                  <span className="w-5 h-5 rounded-full bg-[#34A853] text-white font-mono font-bold flex items-center justify-center text-[10px] shrink-0">3</span>
                  <span><strong>10m Proximity Check:</strong> Backend computes the exact distance between both devices. Capture confirms only if distance &le; 10 meters!</span>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 9: GPS and Location Permissions */}
          {currentPage === 9 && (
            <div className="space-y-4">
              <div className="inline-block comic-stamp bg-[#E8F0FE] dark:bg-[#1E3A8A] text-[#4285F4] dark:text-[#93C5FD] text-[10px]">
                ✦ FIELD MANUAL #09
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                GPS Accuracy & Player Privacy
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                RunAlive is built around outdoor sports and fair play. Location accuracy and personal privacy are safeguarded by design:
              </p>

              <div className="space-y-3 text-xs text-[#475569] dark:text-[#94A3B8]">
                <div className="p-3 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-start space-x-3">
                  <MapPin className="w-5 h-5 text-[#34A853] shrink-0" />
                  <div>
                    <span className="font-heading font-bold text-[#18181B] dark:text-white block">
                      High Accuracy GPS:
                    </span>
                    <span>
                      Keep browser/device location permissions set to "High Accuracy". Playing in open outdoor spaces provides optimal satellite triangulation.
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-[#0F172A] rounded-xl border border-[#CBD5E1] dark:border-[#334155] flex items-start space-x-3">
                  <Lock className="w-5 h-5 text-[#4285F4] shrink-0" />
                  <div>
                    <span className="font-heading font-bold text-[#18181B] dark:text-white block">
                      Strict Privacy Isolation:
                    </span>
                    <span>
                      Your exact live coordinates are never broadcast to opposing teams. Only game mechanics (such as danger radar thresholds) process location data.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 10: Ready to Play */}
          {currentPage === 10 && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#FBBC04] border-[3px] border-[#18181B] dark:border-white shadow-[4px_4px_0px_#18181B] dark:shadow-[4px_4px_0px_#020617] flex items-center justify-center font-heading font-black text-2xl text-[#18181B] mx-auto animate-bounce">
                RA
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black leading-tight">
                You're Ready for Adventure!
              </h2>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto leading-relaxed">
                You now know everything required to host matches, join squads, master the map, and outrun or capture your friends.
              </p>

              <div className="p-4 bg-white dark:bg-[#0F172A] rounded-xl border-2 border-[#18181B] dark:border-[#475569] text-xs max-w-md mx-auto space-y-1.5 text-left">
                <div className="flex items-center space-x-2 text-[#34A853]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-bold">Outdoor footwear & charged mobile battery ready</span>
                </div>
                <div className="flex items-center space-x-2 text-[#4285F4]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-bold">GPS location permissions allowed</span>
                </div>
                <div className="flex items-center space-x-2 text-[#EA4335]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-bold">Team coordination & sportsmanship agreed</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleFinish}
                  className="px-8 py-3.5 comic-btn-primary text-sm font-heading font-black shadow-[4px_4px_0px_#18181B] mx-auto inline-flex items-center space-x-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>FINISH GUIDE & ENTER MISSION CONTROL</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="bg-[#FAF8F5] dark:bg-[#0F172A] border-t-[2.5px] border-[#18181B] dark:border-[#475569] p-3.5 sm:p-4 flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={currentPage === 1}
            className="px-3.5 py-2 comic-btn-white text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Previous</span>
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center space-x-1.5">
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentPage(idx + 1)}
                className={`w-2.5 h-2.5 rounded-full border border-[#18181B] dark:border-[#475569] transition ${
                  currentPage === idx + 1
                    ? 'bg-[#FBBC04] scale-125'
                    : 'bg-white dark:bg-[#334155] hover:bg-[#CBD5E1]'
                }`}
                title={`Go to page ${idx + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleFinish}
              className="text-xs font-heading font-bold text-[#64748B] dark:text-[#94A3B8] hover:text-[#18181B] dark:hover:text-white px-2 py-1 transition"
            >
              Skip
            </button>
            {currentPage < totalPages ? (
              <button
                onClick={handleNext}
                className="px-4 py-2 comic-btn-primary text-xs flex items-center space-x-1.5"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="px-4 py-2 comic-btn-green text-xs flex items-center space-x-1.5"
              >
                <span>Finish</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

PlayerJournal.displayName = 'PlayerJournal';
export default PlayerJournal;
