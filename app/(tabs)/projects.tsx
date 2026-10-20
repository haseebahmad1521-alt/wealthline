import { useState } from 'react';
import { View, FlatList, ScrollView, useWindowDimensions } from 'react-native';
import { Button } from 'heroui-native';
import * as Haptics from 'expo-haptics';
import { usePeople, useProjects } from '@/lib/wealthline';
import { Page, Type, DataState, Empty, ProjectCard } from '@/components/wealthline-ui';
import { colors } from '@/lib/wealthline-theme';
export default function Projects() {
  const projects = useProjects();
  const people = usePeople();
  const [status, setStatus] = useState('all');
  const [person, setPerson] = useState('all');
  const { width } = useWindowDimensions();
  const loading = projects.isPending || people.isPending;
  const error = projects.isError || people.isError;
  const data = (projects.data ?? []).filter(
    (p) =>
      (status === 'all' || p.status === status) &&
      (person === 'all' || p.billionaire_id === person),
  );
  return (
    <Page scrollable={false}>
      <View style={{ paddingTop: 30, paddingBottom: 22, gap: 18 }}>
        <Type
          weight="bold"
          style={{ fontSize: width >= 800 ? 56 : 38, lineHeight: 64, letterSpacing: -2 }}
        >
          What’s next.
        </Type>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All projects' },
            { id: 'new', label: 'New' },
            { id: 'upcoming', label: 'Upcoming' },
          ].map((s) => (
            <Button
              key={s.id}
              variant={status === s.id ? 'primary' : 'secondary'}
              size="sm"
              className="rounded-full"
              onPress={() => {
                setStatus(s.id);
                void Haptics.selectionAsync();
              }}
            >
              <Button.Label numberOfLines={1}>{s.label}</Button.Label>
            </Button>
          ))}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {[{ id: 'all', name: 'Everyone' }, ...(people.data ?? []).filter((p) => p.name)].map(
            (p) => (
              <Button
                key={p.id}
                variant="tertiary"
                className="rounded-full"
                size="sm"
                style={{ backgroundColor: person === p.id ? colors.soft : 'transparent' }}
                onPress={() => {
                  setPerson(p.id);
                  void Haptics.selectionAsync();
                }}
              >
                <Button.Label
                  numberOfLines={1}
                  style={{ fontSize: 12, color: person === p.id ? colors.text : colors.muted }}
                >
                  {p.name}
                </Button.Label>
              </Button>
            ),
          )}
        </ScrollView>
      </View>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        data={loading || error ? [] : data}
        keyExtractor={(p) => p.id}
        ItemSeparatorComponent={() => <View style={{ height: 18 }} />}
        renderItem={({ item }) => (
          <ProjectCard
            project={item}
            person={people.data?.find((p) => p.id === item.billionaire_id)}
          />
        )}
        ListEmptyComponent={
          loading || error ? (
            <DataState
              loading={loading}
              error={error}
              retry={() => {
                void projects.refetch();
                void people.refetch();
              }}
            />
          ) : (
            <Empty
              title={
                status !== 'all' || person !== 'all'
                  ? 'No projects match these filters.'
                  : 'Verified projects will appear here when published.'
              }
              label={status !== 'all' || person !== 'all' ? 'Clear filters' : 'Explore people'}
              action={
                status !== 'all' || person !== 'all'
                  ? () => {
                      setStatus('all');
                      setPerson('all');
                    }
                  : undefined
              }
            />
          )
        }
      />
    </Page>
  );
}
