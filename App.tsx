import React, { useEffect, useRef, useState } from 'react';
import { useMachine } from '@xstate/react';
import { createMachine, assign } from 'xstate';
import styled from 'styled-components';

/* -----------------------------------------------------------
   Styled Components & Global Layout
----------------------------------------------------------- */

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: var(--bg-white, #ffffff);
`;

const Card = styled.div`
  width: 480px;
  background: var(--bg-card, #f0f0ef);
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  padding: 16px;
  position: relative;
`;

const TrafficLightBar = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 16px;
`;

const CircleButton = styled.div<{ bg: string }>`
  width: 14px;
  height: 14px;
  background: ${(props) => props.bg};
  border-radius: 50%;
  margin-right: 10px;
  cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.12);
`;

const TimerDisplay = styled.div`
  font-family: 'Public Sans', sans-serif;
  font-weight: 700;
  font-size: 72px;
  letter-spacing: 2px;
  color: var(--text, #32302c);
  text-align: center;
  position: relative;
  margin-bottom: 16px;
  user-select: none;
`;

const ControlsRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
`;

const ControlButton = styled.button`
  width: 108px;
  height: 40px;
  background: var(--bg-white, #ffffff);
  border: none;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  font-family: 'Public Sans', sans-serif;
  font-weight: 700;
  cursor: pointer;
`;

const PopupBadge = styled.div`
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%);
  width: 160px;
  height: 44px;
  background: var(--bg-white, #ffffff);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: 'Public Sans', sans-serif;
  font-weight: 700;
  font-size: 16px;
`;

const TomatoButton = styled.div`
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: url('tomato.svg') center/cover no-repeat;
  cursor: pointer;
  margin: 0 auto 16px;
  position: relative;
`;

/* -----------------------------------------------------------
   Constants & Durations
----------------------------------------------------------- */

const PREPARE_DURATION = 10 * 60; // 10 minutes (in seconds)
const FOCUS_DURATION = 25 * 60;    // 25 minutes
const SHORT_BREAK_DURATION = 5 * 60;  // 5 minutes
const LONG_BREAK_DURATION = 15 * 60;  // 15 minutes

/* -----------------------------------------------------------
   XState Machine Definition
----------------------------------------------------------- */

interface PomodoroContext {
  phase: 'prepare' | 'focus' | 'shortBreak' | 'longBreak';
  remaining: number;
  pomodorosCompleted: number;
  label: string;
}

type PomodoroEvent =
  | { type: 'START' }
  | { type: 'TICK' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'SKIP' }
  | { type: 'RESET' };

const pomodoroMachine = createMachine<PomodoroContext, PomodoroEvent>(
  {
    id: 'pomodoro',
    initial: 'idle',
    context: {
      phase: 'prepare',
      remaining: PREPARE_DURATION,
      pomodorosCompleted: 0,
      label: ''
    },
    states: {
      idle: {
        on: {
          START: {
            target: 'running',
            actions: assign(() => {
              // If a prepare session is specified, start with it.
              if (PREPARE_DURATION > 0) {
                return { phase: 'prepare', remaining: PREPARE_DURATION };
              }
              return { phase: 'focus', remaining: FOCUS_DURATION };
            })
          }
        }
      },
      running: {
        on: {
          TICK: [
            {
              cond: (context) => context.remaining <= 1,
              target: 'transition'
            },
            {
              actions: assign((context) => ({
                remaining: context.remaining - 1
              }))
            }
          ],
          PAUSE: 'paused',
          STOP: 'idle',
          RESET: {
            target: 'idle',
            actions: assign(() => ({
              phase: 'prepare',
              remaining: PREPARE_DURATION,
              pomodorosCompleted: 0,
              label: ''
            }))
          },
          SKIP: 'transition'
        }
      },
      paused: {
        on: {
          RESUME: 'running',
          STOP: 'idle',
          RESET: {
            target: 'idle',
            actions: assign(() => ({
              phase: 'prepare',
              remaining: PREPARE_DURATION,
              pomodorosCompleted: 0,
              label: ''
            }))
          }
        }
      },
      transition: {
        always: {
          target: 'running',
          actions: assign((context) => {
            let nextPhase: PomodoroContext['phase'] = 'focus';
            let nextTime = FOCUS_DURATION;
            if (context.phase === 'prepare') {
              nextPhase = 'focus';
              nextTime = FOCUS_DURATION;
            } else if (context.phase === 'focus') {
              const completed = context.pomodorosCompleted + 1;
              if (completed % 4 === 0) {
                nextPhase = 'longBreak';
                nextTime = LONG_BREAK_DURATION;
              } else {
                nextPhase = 'shortBreak';
                nextTime = SHORT_BREAK_DURATION;
              }
              return { phase: nextPhase, remaining: nextTime, pomodorosCompleted: completed };
            } else if (context.phase === 'shortBreak' || context.phase === 'longBreak') {
              nextPhase = 'focus';
              nextTime = FOCUS_DURATION;
            }
            return { phase: nextPhase, remaining: nextTime };
          })
        }
      }
    }
  },
  {}
);

/* -----------------------------------------------------------
   Pomodoro Widget Component
----------------------------------------------------------- */

const PomodoroWidget: React.FC = () => {
  const [state, send] = useMachine(pomodoroMachine);
  const { phase, remaining } = state.context;
  const [isTomatoPaused, setIsTomatoPaused] = useState(false);
  const [showLabelPopup, setShowLabelPopup] = useState(false);
  const [tempLabel, setTempLabel] = useState('');
  const intervalRef = useRef<number | null>(null);

  // Formats seconds into MM:SS format.
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Tick the timer when in "running" state and not paused.
  useEffect(() => {
    if (state.matches('running') && !isTomatoPaused) {
      intervalRef.current = window.setInterval(() => {
        send('TICK');
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state, isTomatoPaused, send]);

  // Button Handlers
  const handleStart = () => {
    send('START');
  };

  const handleStop = () => {
    send('STOP');
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const handleReset = () => {
    send('RESET');
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const handleSkip = () => {
    send('SKIP');
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  // Tomato click toggles pause/resume.
  const handleTomatoClick = () => {
    if (state.matches('running')) {
      send('PAUSE');
      setIsTomatoPaused(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
    } else if (state.matches('paused')) {
      send('RESUME');
      setIsTomatoPaused(false);
    }
  };

  // Green button shows the label popup.
  const handleLabelButton = () => {
    setShowLabelPopup(true);
  };

  // When the user presses Enter in the label input, save and close the popup.
  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // In a refined implementation, you could update the machine context here.
      // For now, we simply close the popup.
      setShowLabelPopup(false);
    }
  };

  // Every time the phase changes, display a brief popup badge.
  const [showPhasePopup, setShowPhasePopup] = useState(true);
  useEffect(() => {
    setShowPhasePopup(true);
    const timer = setTimeout(() => {
      setShowPhasePopup(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <Card>
      {/* Traffic Light Navigation */}
      <TrafficLightBar>
        {/* Red Button - Home: resets view (you can augment to navigate) */}
        <CircleButton bg="#ff604d" onClick={handleStop} />
        {/* Yellow Button - Settings: for brevity, settings not fully implemented */}
        <CircleButton bg="#f5c203" onClick={() => alert('Settings panel not implemented')} />
        {/* Green Button - Label session */}
        <CircleButton bg="#0ccf35" onClick={handleLabelButton} />
      </TrafficLightBar>

      {/* Phase Popup Badge */}
      {showPhasePopup && <PopupBadge>{phase.toUpperCase()}</PopupBadge>}

      {/* Big Tomato Icon for pause/resume */}
      <TomatoButton onClick={handleTomatoClick} />

      {/* Timer Display */}
      <TimerDisplay>{formatTime(remaining)}</TimerDisplay>

      {/* Control Buttons */}
      <ControlsRow>
        {state.matches('idle') && <ControlButton onClick={handleStart}>START</ControlButton>}
        {(state.matches('running') || state.matches('paused')) && (
          <ControlButton onClick={handleStop}>STOP</ControlButton>
        )}
        <ControlButton onClick={handleSkip}>SKIP</ControlButton>
        <ControlButton onClick={handleReset}>RESET</ControlButton>
      </ControlsRow>

      {/* History button – placeholder (would open a history view) */}
      <ControlsRow>
        <ControlButton onClick={() => alert('History view not implemented')}>HISTORY</ControlButton>
      </ControlsRow>

      {/* Label Popup Overlay */}
      {showLabelPopup && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#ffffff',
            padding: '16px',
            borderRadius: '8px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            zIndex: 10
          }}
        >
          <input
            type="text"
            value={tempLabel}
            onChange={(e) => setTempLabel(e.target.value)}
            onKeyDown={handleLabelKeyDown}
            placeholder="Label this session"
            style={{
              fontFamily: 'Public Sans',
              fontWeight: 700,
              fontSize: '16px',
              padding: '8px',
              border: '1px solid #e4e4e4',
              borderRadius: '4px'
            }}
          />
        </div>
      )}
    </Card>
  );
};

/* -----------------------------------------------------------
   Main App Component
----------------------------------------------------------- */

const App: React.FC = () => {
  return (
    <Container>
      <PomodoroWidget />
    </Container>
  );
};

export default App;
