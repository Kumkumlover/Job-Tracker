"use client";

import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { format } from "date-fns";
import { ExternalLink, MessageSquare, Mail } from "lucide-react";
import FollowUpBadge from "./FollowUpBadge";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants";
import type { ApplicationWithRelations } from "@/types";
import type { CustomStage } from "@prisma/client";

interface KanbanBoardProps {
  applications: ApplicationWithRelations[];
  stages: CustomStage[];
  onStatusChange: (id: string, status: string) => void;
  onEdit: (app: ApplicationWithRelations) => void;
}

export default function KanbanBoard({
  applications,
  stages,
  onStatusChange,
  onEdit,
}: KanbanBoardProps) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const appId = result.draggableId;
    onStatusChange(appId, newStatus);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "60vh" }}>
        {stages.map((stage) => {
          const stageApps = applications.filter(
            (a) => a.status === stage.slug
          );
          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-72 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--secondary)]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="font-medium text-sm">{stage.name}</span>
                </div>
                <span className="text-xs text-[var(--muted-foreground)] bg-[var(--background)] px-2 py-0.5 rounded-full">
                  {stageApps.length}
                </span>
              </div>

              {/* Droppable Area */}
              <Droppable droppableId={stage.slug}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 p-2 space-y-2 overflow-y-auto ${
                      snapshot.isDraggingOver ? "bg-[var(--primary)]/5" : ""
                    }`}
                    style={{ minHeight: "100px" }}
                  >
                    {stageApps.map((app, index) => (
                      <Draggable
                        key={app.id}
                        draggableId={app.id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:shadow-md transition-shadow ${
                              snapshot.isDragging ? "shadow-lg rotate-1" : ""
                            }`}
                            onClick={() => onEdit(app)}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <span className="font-medium text-sm leading-tight">
                                {app.company}
                              </span>
                              {app.jobUrl && (
                                <a
                                  href={app.jobUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[var(--muted-foreground)] hover:text-[var(--primary)] flex-shrink-0 ml-1"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            <p className="text-xs text-[var(--muted-foreground)] mb-2 line-clamp-1">
                              {app.role}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-[var(--muted-foreground)]">
                                {PLATFORM_LABELS[app.platform as Platform] || app.platform}
                                {" · "}
                                {format(new Date(app.dateApplied), "MMM d")}
                              </span>
                              <div className="flex items-center gap-1">
                                {app.linkedinDmSent && (
                                  <MessageSquare className="w-3 h-3 text-blue-500" />
                                )}
                                {app.emailThreadId && (
                                  <Mail className="w-3 h-3 text-green-500" />
                                )}
                              </div>
                            </div>
                            {app.followUpDate && (
                              <div className="mt-2">
                                <FollowUpBadge
                                  date={app.followUpDate.toString()}
                                />
                              </div>
                            )}
                            {app.location && (
                              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                {app.location}
                              </p>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
