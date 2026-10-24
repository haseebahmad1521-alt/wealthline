import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Icon, icons, minTouch } from '@/components/ui';
import { useAuth } from '@/lib/data';
import { parseParams, suggestName, type PeopleParams, type ProjectParams, type ViewTarget } from '@/lib/view-params';
import { useSavedViews, useViewActions, type SavedView } from '@/lib/views';
import { color, font, radius, space, type } from '@/theme';

export function useAppliedView(target: ViewTarget, viewId: string | undefined) {
  const views = useSavedViews(target);
  return views.data?.find((v) => v.id === viewId);
}

function confirmRemove(view: SavedView, onYes: () => void) {
  const message = `Remove the saved view “${view.name}”?`;
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onYes();
  } else {
    Alert.alert('Remove saved view', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onYes },
    ]);
  }
}

/** Save-view action plus the chip row. Renders nothing when signed out. */
export function SavedViews({
  target,
  params,
  onApply,
}: {
  target: ViewTarget;
  params: PeopleParams | ProjectParams;
  onApply: (view: SavedView) => void;
}) {
  const signedIn = !!useAuth().session;
  const views = useSavedViews(target);
  const actions = useViewActions();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  if (!signedIn) return null;

  const current = JSON.stringify(parseParams(target, params));
  const error = actions.error ?? (views.error ? `Could not load your saved views. ${views.error.message}` : null);

  async function submit() {
    if (!name.trim()) return;
    if (await actions.saveView(name, target, params)) setNaming(false);
  }

  return (
    <View style={styles.wrap}>
      {views.data && views.data.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {views.data.map((v) => {
            const selected = JSON.stringify(v.params) === current;
            return (
              <View key={v.id} style={[styles.chip, selected && styles.chipOn]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Saved view ${v.name}`}
                  accessibilityState={{ selected }}
                  onPress={() => onApply(v)}
                  style={styles.chipMain}>
                  <Text style={[type.headline, { color: selected ? color.text : color.textSecondary }]} numberOfLines={1}>
                    {v.name}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove saved view ${v.name}`}
                  onPress={() => confirmRemove(v, () => void actions.deleteView(v.id))}
                  style={styles.chipRemove}>
                  <Icon name={icons.close} size={12} tint={color.textSecondary} />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
      {naming ? (
        <View style={styles.nameRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={60}
            autoFocus
            accessibilityLabel="Name for this view"
            placeholder="Name this view"
            placeholderTextColor={color.textSecondary}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={styles.input}
          />
          <Button label="Save" loading={actions.busy} disabled={!name.trim()} onPress={() => void submit()} />
          <Button label="Cancel" variant="secondary" onPress={() => setNaming(false)} />
        </View>
      ) : (
        <View style={styles.save}>
          <Button
            label="Save view"
            variant="secondary"
            icon={icons.plus}
            onPress={() => {
              actions.clearError();
              setName(suggestName(target, params).slice(0, 60));
              setNaming(true);
            }}
          />
        </View>
      )}
      {error && (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Body style={{ color: color.loss }}>{error}</Body>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  save: { alignSelf: 'flex-start' },
  chips: { gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipOn: { backgroundColor: color.surface, borderColor: color.action },
  chipMain: { minHeight: minTouch, justifyContent: 'center', paddingLeft: space.md, maxWidth: 220 },
  chipRemove: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  input: {
    flexGrow: 1,
    flexBasis: 200,
    minHeight: minTouch,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    fontFamily: font.regular,
    fontSize: 16,
    color: color.text,
  },
});
