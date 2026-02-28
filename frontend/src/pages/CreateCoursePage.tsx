import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { createCourse, triggerGeneration } from '@/api/courses';

interface ObjectiveItem {
  id: number;
  value: string;
}

export function CreateCoursePage() {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const nextId = useRef(1);
  const [objectives, setObjectives] = useState<ObjectiveItem[]>([
    { id: 0, value: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addObjective = useCallback(() => {
    setObjectives((prev) => [...prev, { id: nextId.current++, value: '' }]);
  }, []);

  function removeObjective(id: number) {
    setObjectives((prev) => prev.filter((o) => o.id !== id));
  }

  function updateObjective(id: number, value: string) {
    setObjectives((prev) =>
      prev.map((o) => (o.id === id ? { ...o, value } : o)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = objectives.map((o) => o.value.trim()).filter(Boolean);
    if (!description.trim() || trimmed.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const { id } = await createCourse({
        description: description.trim(),
        objectives: trimmed,
      });
      await triggerGeneration(id);
      navigate(`/courses/${id}/generate`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create a Course</h1>
        <p className="text-muted-foreground">
          Describe what you want to learn and define your objectives
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <Textarea
            placeholder="I want to learn..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium">Learning Objectives</label>
          {objectives.map((obj, i) => (
            <div key={obj.id} className="flex gap-2">
              <Input
                placeholder={`Objective ${i + 1}`}
                value={obj.value}
                onChange={(e) => updateObjective(obj.id, e.target.value)}
              />
              {objectives.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeObjective(obj.id)}
                >
                  &times;
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addObjective}>
            + Add Objective
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={submitting || !description.trim() || objectives.every((o) => !o.value.trim())}
          className="w-full"
        >
          {submitting ? 'Creating...' : 'Generate Course'}
        </Button>
      </form>
    </div>
  );
}
