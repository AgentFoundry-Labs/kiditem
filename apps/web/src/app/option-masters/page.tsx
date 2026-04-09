'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import OptionMasterHeader from './components/OptionMasterHeader';
import OptionMasterGrid from './components/OptionMasterGrid';
import OptionMasterFormModal from './components/OptionMasterFormModal';

interface OptionMaster {
  id: string;
  name: string;
  values: string;
  isActive: boolean;
  createdAt: string;
}

export default function OptionMastersPage() {
  const queryClient = useQueryClient();

  const { data: options = [] } = useQuery({
    queryKey: queryKeys.optionMasters.all,
    queryFn: () => apiClient.get<OptionMaster[]>('/api/option-masters'),
  });

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<OptionMaster | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: { name: string; values: string; isActive: boolean }) =>
      apiClient.post('/api/option-masters', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['option-masters'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; values: string; isActive: boolean } }) =>
      apiClient.patch(`/api/option-masters/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['option-masters'] });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/option-masters/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['option-masters'] }),
  });

  const parseValues = (v: string): string[] => {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const openNew = () => {
    setEditItem(null);
    setShowForm(true);
  };

  const openEdit = (item: OptionMaster) => {
    setEditItem(item);
    setShowForm(true);
  };

  const handleSave = (form: { name: string; isActive: boolean }, tags: string[]) => {
    const body = { name: form.name, values: JSON.stringify(tags), isActive: form.isActive };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, body });
    } else {
      createMutation.mutate(body);
    }
  };

  return (
    <div className="space-y-6">
      <OptionMasterHeader onAdd={openNew} />
      <OptionMasterGrid
        options={options}
        onEdit={openEdit}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
      {showForm && (
        <OptionMasterFormModal
          editName={editItem?.name ?? null}
          initialForm={{
            name: editItem?.name ?? '',
            isActive: editItem?.isActive ?? true,
          }}
          initialTags={editItem ? parseValues(editItem.values) : []}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
